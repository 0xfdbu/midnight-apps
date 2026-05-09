**Note on Methodology & Technical Authorship**

These tutorials and the accompanying repositories are the result of a multi-layered development and documentation process designed to bridge the gap between experimental implementation and professional guidance:

* **Repository Engineering:** The source code was built through an intensive **"vibe-coding"** session on the **Preprod network**, where architectural decisions, debugging strategies, and integration flows emerged from direct experimentation with the Midnight SDKs and wallets (1AM, Lace). AI assisted in executing specific code changes, but all design direction and final verification was manual.

* **Tutorial Construction & Audit:** AI was used to generate *initial* drafts and structural suggestions based on issues encountered during development. These prose drafts were often rough or partially inaccurate. Most prose was heavily rewritten or replaced to improve clarity and accuracy in the author's own voice. Code snippets were typically preserved but audited and polished for accuracy against the existing source code. Tables and concise explanations were kept verbatim after fact-checking. Occasional lines of prose were retained when already accurate and well-written.

* **AI Tooling:** The AI assistant utilized a specialized Midnight MCP server (`midnight-mcp`) for querying official documentation, verifying Compact syntax, analyzing contract structures, and looking up TypeScript SDK patterns. This tooling was used to validate technical claims during both code development and tutorial writing.

* **Verification & Media:** All screenshots, transaction IDs, and console logs are direct artifacts captured from a local development environment during live testing. They serve as proof that the documented flows were executed and verified on-chain.

* **Troubleshooting:** Troubleshooting entries are a mix of AI-generated content (based on manually recorded issues encountered during vibe-coding) and manually written entries. All entries were reviewed, corrected, and supplemented where needed.

* **Production & Style:** A final AI-assisted pass corrected grammar and enforced formatting conventions aligned with the **Midnight Style Guide**. This step was strictly limited to linguistic polish and did not alter technical claims.

The resulting resources are human-verified guides where the core logic, media, and architectural conclusions are original work, supplemented by AI to accelerate drafting and ensure professional clarity.
