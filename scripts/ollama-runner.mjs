import postgres from "file:///d:/paperclip-master/paperclip-master/packages/db/node_modules/postgres/src/index.js";

async function main() {
  const agentId = process.env.PAPERCLIP_AGENT_ID;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;
  const runId = process.env.PAPERCLIP_RUN_ID;

  console.log(`[Ollama Agent Runner] Run started: ${runId || "direct"}`);
  console.log(`[Ollama Agent Runner] Agent ID: ${agentId}, Company ID: ${companyId}`);

  if (!agentId) {
    console.log("[Ollama Agent Runner] No PAPERCLIP_AGENT_ID provided; exiting gracefully.");
    return;
  }

  const sql = postgres("postgres://paperclip:paperclip@127.0.0.1:54329/paperclip");

  try {
    // 1. Get Agent details
    const [agent] = await sql`SELECT id, name, role, company_id FROM agents WHERE id = ${agentId};`;
    if (!agent) {
      console.log(`[Ollama Agent Runner] Agent ${agentId} not found in database.`);
      return;
    }
    const agentName = agent.name || "Agent";
    const effectiveCompanyId = companyId || agent.company_id;
    console.log(`[Ollama Agent Runner] Agent Name: "${agentName}", Role: "${agent.role || 'general'}"`);

    // 2. Check if a specific issue is targeted by this run
    let targetedIssueId = null;
    let validRunId = null;
    if (runId) {
      const [run] = await sql`
        SELECT id, issue_id, native_issue_id, context_snapshot 
        FROM heartbeat_runs 
        WHERE id = ${runId};
      `;
      if (run) {
        validRunId = run.id;
        targetedIssueId = run.issue_id || run.native_issue_id || run.context_snapshot?.issueId || null;
      }
    }

    // 3. Find actionable issues
    let candidates = [];
    if (targetedIssueId) {
      candidates = await sql`
        SELECT id, company_id, identifier, title, description, status 
        FROM issues 
        WHERE id = ${targetedIssueId};
      `;
    } else {
      candidates = await sql`
        SELECT id, company_id, identifier, title, description, status 
        FROM issues 
        WHERE assignee_agent_id = ${agentId} 
          AND status NOT IN ('done', 'cancelled')
        ORDER BY updated_at DESC
        LIMIT 5;
      `;
    }

    console.log(`[Ollama Agent Runner] Found ${candidates.length} candidate issue(s)`);

    for (const issue of candidates) {
      console.log(`\n[Ollama Agent Runner] Inspecting task ${issue.identifier} (${issue.title})...`);

      // 4. Fetch recent comments
      const comments = await sql`
        SELECT id, author_type, author_agent_id, body, created_at 
        FROM issue_comments 
        WHERE issue_id = ${issue.id} 
          AND deleted_at IS NULL 
        ORDER BY created_at ASC;
      `;

      // Check if last comment was from this agent and issue is in_review (waiting for user)
      if (comments.length > 0 && issue.status === "in_review") {
        const lastComment = comments[comments.length - 1];
        if (lastComment.author_type === "agent" && lastComment.author_agent_id === agentId) {
          console.log(`[Ollama Agent Runner] Last comment was already by this agent and issue is in_review. Awaiting user response.`);
          continue;
        }
      }

      console.log(`[Ollama Agent Runner] Processing task ${issue.identifier} with ${comments.length} existing comments...`);

      // 5. Construct conversation messages for Ollama
      const systemPrompt = `You are ${agentName}, an intelligent and reliable AI assistant in Paperclip.
You are assigned to the task: "${issue.title}".
Task description: "${issue.description || 'No additional description provided.'}".
Answer clearly, concisely, and accurately. If a mathematical calculation or coding question is asked, provide the complete and correct answer directly.`;

      const messages = [{ role: "system", content: systemPrompt }];

      if (comments.length === 0) {
        messages.push({
          role: "user",
          content: issue.description || issue.title || "Please start working on this task and report your initial plan or response."
        });
      } else {
        // Take up to last 10 comments for context
        const recent = comments.slice(-10);
        for (const c of recent) {
          if (c.author_type === "agent") {
            messages.push({ role: "assistant", content: c.body });
          } else {
            messages.push({ role: "user", content: c.body });
          }
        }
      }

      // 6. Call Ollama
      console.log(`[Ollama Agent Runner] Calling Ollama (llama3.2:1b) with ${messages.length} messages...`);
      const ollamaRes = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3.2:1b",
          messages,
          temperature: 0.2
        })
      });

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text().catch(() => "");
        console.error(`[Ollama Agent Runner] Ollama error: ${ollamaRes.status} ${errText}`);
        continue;
      }

      const ollamaData = await ollamaRes.json();
      const reply = ollamaData.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        console.warn("[Ollama Agent Runner] Empty response received from Ollama.");
        continue;
      }

      console.log(`[Ollama Agent Runner] Generated response (${reply.length} chars):`);
      console.log(reply.slice(0, 150) + (reply.length > 150 ? "..." : ""));

      // 7. Insert agent comment
      await sql`
        INSERT INTO issue_comments (
          id, company_id, issue_id, author_agent_id, author_type, body, created_by_run_id, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${effectiveCompanyId},
          ${issue.id},
          ${agentId},
          'agent',
          ${reply},
          ${validRunId},
          NOW(),
          NOW()
        );
      `;
      console.log(`[Ollama Agent Runner] Successfully posted agent comment to ${issue.identifier}`);

      // 8. Update issue status
      await sql`
        UPDATE issues 
        SET status = 'in_review', updated_at = NOW() 
        WHERE id = ${issue.id};
      `;
      console.log(`[Ollama Agent Runner] Task ${issue.identifier} status updated to 'in_review'`);
    }

    console.log("[Ollama Agent Runner] Run completed successfully.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[Ollama Agent Runner] Fatal error:", err);
  process.exit(1);
});
