import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  conversations,
  messages,
  propertiesTable,
  paymentsTable,
} from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CreateOpenaiConversationBody,
  SendOpenaiMessageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /openai/conversations
router.get("/openai/conversations", async (_req, res) => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  res.json(rows);
});

// POST /openai/conversations
router.post("/openai/conversations", async (req, res) => {
  const body = CreateOpenaiConversationBody.parse(req.body);
  const [row] = await db.insert(conversations).values(body).returning();
  res.status(201).json(row);
});

// GET /openai/conversations/:id
router.get("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  res.json({ ...conv, messages: msgs });
});

// DELETE /openai/conversations/:id
router.delete("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  await db.delete(conversations).where(eq(conversations.id, id));
  res.status(204).end();
});

// GET /openai/conversations/:id/messages
router.get("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  res.json(msgs);
});

// POST /openai/conversations/:id/messages  (SSE streaming)
router.post("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const body = SendOpenaiMessageBody.parse(req.body);

  // Save user message
  await db.insert(messages).values({
    conversationId: id,
    role: "user",
    content: body.content,
  });

  // Fetch all prior messages for this conversation
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  // Build portfolio context
  const properties = await db
    .select()
    .from(propertiesTable)
    .orderBy(propertiesTable.name);

  const propertySummaries = await Promise.all(
    properties.map(async (prop) => {
      const [lastPayment] = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.propertyId, prop.id))
        .orderBy(desc(paymentsTable.paymentNumber))
        .limit(1);

      const loanAmount = Number(prop.loanAmount);
      const currentValue = Number(prop.currentValue);
      const currentBalance = lastPayment
        ? Number(lastPayment.remainingBalance)
        : loanAmount;
      const equity = currentValue - currentBalance;
      const equityPercent =
        currentValue > 0 ? ((equity / currentValue) * 100).toFixed(1) : "0";

      return `
Property: ${prop.name}
  Address: ${prop.address}
  Year Bought: ${prop.yearBought}
  Purchase Price: $${Number(prop.purchasePrice).toLocaleString()}
  Current Value: $${currentValue.toLocaleString()}
  Original Loan: $${loanAmount.toLocaleString()} @ ${Number(prop.interestRate)}% for ${prop.loanTermYears} years
  Loan Start Date: ${prop.loanStartDate}
  Monthly Payment: $${Number(prop.monthlyPayment).toLocaleString()}
  Current Balance: $${currentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  Equity: $${equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${equityPercent}% of value)
  Notes: ${prop.notes ?? "None"}`;
    })
  );

  const totalValue = properties.reduce((s, p) => s + Number(p.currentValue), 0);
  const totalMonthly = properties.reduce(
    (s, p) => s + Number(p.monthlyPayment),
    0
  );

  const systemPrompt = `You are a knowledgeable real estate portfolio assistant. You have full access to the user's real estate portfolio data and can answer any questions about their properties, loans, equity, cash flow, and investment performance.

Today's date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

== PORTFOLIO SUMMARY ==
Total Properties: ${properties.length}
Total Portfolio Value: $${totalValue.toLocaleString()}
Total Monthly Payments: $${totalMonthly.toLocaleString()}

== PROPERTY DETAILS ==
${propertySummaries.join("\n")}

Answer questions clearly and concisely. When referencing dollar amounts, format them with commas and two decimal places. Be helpful, specific, and use the actual data above to give accurate answers. If asked about something not in the data (like rental income or expenses), explain that the data isn't tracked in the system.`;

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  const stream = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: body.content },
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  // Save assistant message
  await db.insert(messages).values({
    conversationId: id,
    role: "assistant",
    content: fullResponse,
  });

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
