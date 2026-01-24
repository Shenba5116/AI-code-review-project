"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const node_fetch_1 = require("node-fetch");
function activate(context) {
    console.log('AI Code Review extension is now active!');
    const disposable = vscode.commands.registerCommand('ai-code-review.runChecklist', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor');
            return;
        }
        const document = editor.document;
        const code = document.getText();
        const filePath = document.uri.fsPath;
        // 1) Load checklist JSON from workspace root
        const checklist = await loadChecklist();
        if (!checklist) {
            vscode.window.showErrorMessage('.aicodechecklist.json not found in workspace root');
            return;
        }
        // 2) Create output channel
        const channel = vscode.window.createOutputChannel('AI Checklist Review');
        channel.clear();
        channel.appendLine('AI Checklist Review');
        channel.appendLine('===================');
        channel.appendLine(`File: ${filePath}`);
        channel.appendLine('');
        channel.appendLine('Loaded checklist:');
        channel.appendLine(JSON.stringify(checklist, null, 2));
        channel.appendLine('');
        channel.appendLine('Code preview (first 200 chars):');
        channel.appendLine(code.slice(0, 200));
        channel.appendLine('');
        channel.appendLine('Running LLM review...');
        channel.show();
        // 3) Call LLM
        try {
            const results = await runLLMReview(code, checklist);
            channel.appendLine('');
            channel.appendLine('AI Checklist Results:');
            for (const r of results) {
                channel.appendLine(`- [${r.status}] (${r.category ?? 'Unknown'} / ${r.priority ?? '-'}) ${r.id}: ${r.reason}`);
            }
            vscode.window.showInformationMessage('AI checklist review completed.');
        }
        catch (err) {
            channel.appendLine('LLM error: ' + String(err));
            vscode.window.showErrorMessage('Failed to run LLM review. See output for details.');
        }
    });
    context.subscriptions.push(disposable);
}
async function loadChecklist() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return null;
    }
    const root = folders[0].uri.fsPath;
    const checklistPath = path.join(root, '.aicodechecklist.json');
    try {
        const content = await fs.promises.readFile(checklistPath, 'utf8');
        const json = JSON.parse(content);
        return json;
    }
    catch (err) {
        console.error('Error reading checklist:', err);
        return null;
    }
}
async function runLLMReview(code, checklist) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable not set.');
    }
    // Build a concise prompt
    const prompt = `You are a senior software engineer doing a strict code review.

Here is the code to review:
---
${code}
---

Here is a JSON checklist of review items:
---
${JSON.stringify(checklist, null, 2)}
---

For EACH checklist item, decide:
- status: "Pass", "Fail", or "NeedsAttention"
- reason: short explanation (one or two sentences)

Return ONLY a JSON array of objects like:
[
  {
    "id": "func_req",
    "status": "Pass",
    "reason": "Explanation.",
    "category": "Functionality & Logic",
    "priority": "Critical"
  }
]
`;
    const response = await (0, node_fetch_1.default)('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini', // or any model you have access to
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: 0.1
        })
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${text}`);
    }
    const data = await response.json();
    const content = data.choices[0].message.content;
    try {
        // Extract JSON from potential markdown code block
        let jsonString = content.trim();
        if (jsonString.startsWith('```json')) {
            jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        }
        else if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        const parsed = JSON.parse(jsonString);
        return parsed;
    }
    catch (err) {
        throw new Error('Failed to parse LLM JSON: ' + content);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map