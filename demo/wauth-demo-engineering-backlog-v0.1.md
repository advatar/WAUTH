# WAUTH demo: phased engineering backlog

## 1. Demo objective
Build a convincing end-to-end demo showing that a ChatGPT app backed by an MCP server can request authority, receive bounded WAUTH capabilities from a Wallet Authorization Service (WAS / PWMA), use a wwWallet-like credential store for persisted credentials, invoke human step-up on an iPhone EU Wallet profile app, and satisfy mock relying parties that enforce WAUTH at the execution boundary.

### Audience takeaway
- ChatGPT never receives the user's root keys.
- The user approves only the moments that matter.
- The agent acts autonomously only inside bounded authority.
- The relying party is the lock: execution does not happen without the right proof.
- The new WAUTH operational-safety profiles stop common agent failure modes.

## 2. Demo scope
### Primary storyline
Tax filing:
1. User connects WAUTH Wallet App to ChatGPT.
2. User asks ChatGPT to submit taxes.
3. Bank and Employer RPs require WAUTH capabilities for evidence gathering.
4. User approves read-only access on iPhone.
5. Agent prepares the draft autonomously.
6. IRS RP demands stronger proof for final submission.
7. User approves final submission on iPhone.
8. IRS accepts and issues a receipt.

### Safety vignettes
- Requester continuity: spoofed owner in new channel denied.
- Instruction source integrity: mutable external note cannot become governing policy.
- Execution budgets: helper agent cannot create a persistent watcher / cron job.
- Postcondition verification: success requires a verified receipt, not agent narration.
- Multi-agent trust: sub-agent receives narrower authority than parent.

### Non-goals
- Real IRS or bank integrations.
- Full production EUDI interoperability.
- Real tax rules beyond what is needed for the story.
- Production-grade attestation or regulatory claims.

## 3. Target architecture
### Core components
- **ChatGPT App / MCP Wallet App**: user-facing app, widget UI, QR rendering, status panels.
- **Task Agent**: primary agent inside ChatGPT.
- **Helper sub-agent**: narrow helper such as BankFetcher.
- **WAS / PWMA**: policy engine, mandate issuer, capability issuer, step-up orchestrator.
- **Credential Store**: wwWallet-like encrypted cloud vault for credentials, drafts, and receipts.
- **KCS**: key custody for agent proof-of-possession keys; no raw private-key export.
- **HAPP Presence Provider on iPhone**: EU Wallet profile app for step-up approvals.
- **Mock RPs**: Bank, Employer, IRS, plus a Safety/Admin RP.
- **Receipts / Provenance log**: auditable event trail.

### Trust boundaries
- User root approval keys stay on the iPhone.
- Agent operational keys stay in KCS.
- Credential persistence happens in the encrypted cloud wallet.
- RP-side enforcement decides whether execution happens.

## 4. Product decisions to freeze early
1. **Credential Store profile**: wwWallet-like encrypted cloud wallet, not the long-lived signing boundary.
2. **KCS implementation**: Vault Transit, cloud KMS, or SoftHSM-backed signer.
3. **HAPP transport**: QR first, deep-link optional.
4. **Mock RP stack**: one shared verifier library plus separate RP apps.
5. **Sequence of approvals**: read-only evidence gathering and final submission only.
6. **Presentation style**: one main tax flow plus short safety vignettes.
7. **Operator view**: visible receipts, capability IDs, action hashes, replay consumption, and approval events.

## 5. Workstreams

## Workstream A - WAUTH app and UI surface
### Objective
Expose the wallet / authority experience inside ChatGPT through a remote MCP server plus widget UI.

### Deliverables
- MCP tools:
  - `aaif.wauth.request`
  - `aaif.wauth.get` (optional)
- Widget UI with:
  - QR display
  - pending approvals
  - active mandates
  - active capabilities
  - receipts / provenance timeline
  - demo reset controls
- Flow handoff between model, MCP tool, and widget state.

### Acceptance criteria
- ChatGPT can invoke the WAUTH app from a conversation.
- The widget can show `wauth_required` details, QR prompts, and final receipts.
- The UI remains stable during a complete tax demo.

## Workstream B - WAS / PWMA core
### Objective
Implement the authority translator between user intent, policy, step-up, and RP-consumable capabilities.

### Deliverables
- Mandate issuance
- Capability issuance
- Action-hash binding support
- HAPP orchestration
- Requester continuity checks
- Sub-agent narrowing
- Receipt emission
- Discovery and JWKS endpoints

### Acceptance criteria
- A valid RP requirement can be translated into a signed WAUTH capability.
- Fresh step-up can be required by policy.
- Parent and sub-agent authority is visibly monotonic.

## Workstream C - Credential Store
### Objective
Provide persisted credentials and artifacts with a wwWallet-like cloud-wallet profile.

### Deliverables
- Encrypted storage layer
- Credential catalog
- Draft return storage
- Receipt storage
- Import and lookup APIs
- Optional OID4VCI / OID4VP demo hooks

### Acceptance criteria
- Credentials survive between sessions.
- Drafts and receipts can be recovered and displayed.
- Wallet data is accessible only through the WAS / wallet app path.

## Workstream D - Key Custody Service
### Objective
Separate agent signing keys from both the user and the browser wallet runtime.

### Deliverables
- Agent key registration
- DPoP signing
- Sub-agent key issuance or registration
- Signing audit trail
- Key rotation / reset for demo environment

### Acceptance criteria
- No agent private key is exposed to ChatGPT.
- DPoP verification succeeds against mock RPs.
- Replay and wrong-key attempts fail.

## Workstream E - HAPP EU Wallet profile on iPhone
### Objective
Demonstrate real human step-up using an iPhone app that behaves like an EU Wallet profile.

### Deliverables
- QR scan / deep-link entry
- Approval view with plain-language consent summary
- Face ID / local authentication
- HAPP proof return to WAS
- Mirrorable screen for live demo

### Acceptance criteria
- Read-only bank approval works on phone.
- Final IRS submission approval works on phone.
- Approval proof is visible in the audit log.

## Workstream F - Mock relying parties
### Objective
Create believable locks that enforce WAUTH rather than trusting the agent.

### Deliverables
#### Bank RP
- Metadata endpoint
- Statement endpoint
- `wauth_required` response
- DPoP and capability verification
- Read-only envelope checks

#### Employer RP
- Income statement endpoint
- Same enforcement model as Bank RP

#### IRS RP
- Draft endpoint
- Submit endpoint
- RP-computed `action_hash`
- Stronger assurance requirement for final submission
- Receipt endpoint

#### Safety/Admin RP
- Privileged delete
- Persistent watcher request
- External-policy import request
- Multi-agent trust / admin flow stubs

### Acceptance criteria
- Each RP can deny without valid capability.
- Each RP can accept with a valid capability.
- IRS submission verifies exact-action binding.

## Workstream G - Safety profiles
### Objective
Show that WAUTH addresses real agent failure modes, not just happy-path auth.

### Deliverables
- Requester continuity policy
- Instruction source integrity policy and source classification
- Execution budgets policy
- Postcondition verification policy
- Multi-agent trust policy

### Acceptance criteria
- Spoofed owner command in a new channel is denied or escalated.
- Mutable external source cannot silently become governing policy.
- Persistent process creation fails without explicit authority.
- Claimed success is distinguished from verified success.
- Sub-agent cannot widen authority beyond parent.

## Workstream H - Demo orchestration and observability
### Objective
Make the demo inspectable, restartable, and stage-friendly.

### Deliverables
- Scenario reset tools
- Seed data loader
- Timeline / event viewer
- Receipt viewer
- Action-hash / capability inspector
- Health dashboard for all services

### Acceptance criteria
- Team can reset the entire demo in under 2 minutes.
- Presenter can show what happened at each step.
- Failure modes can be triggered deterministically.

## 6. Phased implementation plan

## Phase 0 - Architecture freeze and demo contract
### Goal
Lock the narrative, component boundaries, and success criteria before coding deep behavior.

### Tasks
- Freeze the demo story and success metrics.
- Freeze the list of RPs and their endpoints.
- Freeze the authority model for the main flow.
- Decide what will be real vs mocked.
- Decide the visible audit / operator console behavior.
- Approve the architecture diagram and sequence diagrams.

### Exit criteria
- Sign-off on one architecture diagram and one sequence diagram.
- Sign-off on what the presenter will say at each step.

## Phase 1 - Backbone and happy-path primitives
### Goal
Get one RP end-to-end with real WAUTH capability issuance and DPoP.

### Tasks
- Stand up MCP Wallet App skeleton.
- Stand up WAS skeleton.
- Stand up KCS skeleton.
- Build Bank RP.
- Implement `wauth_required` -> capability -> retry -> success loop.
- Add basic QR approval flow with a mock HAPP responder.

### Exit criteria
- ChatGPT can request bank statement access and retrieve the statement.
- DPoP and capability verification work end-to-end.

## Phase 2 - Tax storyline completion
### Goal
Complete the main tax narrative with Bank, Employer, and IRS RPs.

### Tasks
- Add Employer RP.
- Add IRS draft and submit endpoints.
- Implement RP-computed `action_hash` in IRS RP.
- Add draft storage and receipt storage.
- Add final submission approval path.
- Add optional identity presentation step.

### Exit criteria
- Full tax flow completes end-to-end.
- Final submission produces verified receipt.

## Phase 3 - Real phone step-up
### Goal
Replace mock approval with the iPhone EU Wallet profile app.

### Tasks
- Build iPhone approval UI.
- Add QR scanner / deep-link flow.
- Add Face ID / local auth.
- Return real HAPP proof to WAS.
- Mirror phone display for stage use.

### Exit criteria
- Live phone approval can be demonstrated twice in one run without operator intervention.

## Phase 4 - Operational-safety profiles
### Goal
Show that WAUTH handles realistic agent failures.

### Tasks
- Implement requester continuity checks.
- Implement instruction source classification and denial path.
- Implement execution budgets and persistent-side-effect denial.
- Implement postcondition verification and receipt distinction.
- Implement sub-agent narrowing and one multi-agent vignette.

### Exit criteria
- Each vignette can be triggered and resolved in under 90 seconds.

## Phase 5 - Demo polish and operator ergonomics
### Goal
Turn the system into a stage-grade demo.

### Tasks
- Add observability timeline.
- Add reset tooling.
- Add seeded data and deterministic scripts.
- Add presenter hints and labels.
- Improve all wording in UI surfaces.
- Run full rehearsal with screen sharing and mirrored phone.

### Exit criteria
- Demo runs cleanly three times in a row.
- Failure recovery is documented and fast.

## 7. Suggested sprint view
### Sprint 1
- Phase 0 complete
- Bank RP complete
- `wauth_required` + capability + DPoP complete

### Sprint 2
- Employer RP complete
- IRS draft / submit complete
- Draft + receipt storage complete

### Sprint 3
- iPhone HAPP app complete
- QR/deep-link complete
- End-to-end tax flow complete

### Sprint 4
- Safety profiles complete
- Sub-agent narrowing complete
- Observability timeline complete

### Sprint 5
- Demo polish
- Rehearsal
- Backup flows
- Recording / screenshots / website assets

## 8. Real vs mocked
### Make real
- WAUTH requirement signaling
- Capability issuance
- DPoP verification
- RP verification logic
- iPhone approval interaction
- Receipts and provenance
- Action-hash binding
- Sub-agent narrowing

### Mock or simplify
- Government schemas
- Real bank APIs
- Real Entra / EUDI issuer federation
- Real tax calculations beyond demo needs
- Production compliance claims

## 9. Risks and mitigations
### Risk: too much protocol detail on stage
Mitigation: keep the story user- and RP-centered; show protocol details only when explaining why a lock accepted or denied.

### Risk: phone demo latency
Mitigation: keep QR and approval payloads tiny; prepare deep-link fallback; keep a simulator backup.

### Risk: KCS complexity delays the demo
Mitigation: use a practical signing service first, then harden the implementation boundary later.

### Risk: too many safety vignettes dilute the main flow
Mitigation: treat the tax flow as the main act and keep vignettes short and operator-triggered.

### Risk: website and demo drift apart
Mitigation: maintain one architecture source and one sequence source in Mermaid, and reuse them in the website, one-pager, and demo console.

## 10. Demo-ready checklist
- ChatGPT app visible and stable
- Bank, Employer, IRS, Safety RP healthy
- WAS, CS, KCS healthy
- Phone connected and mirrored
- Reset script tested
- Seed data loaded
- All receipts visible
- Backup HAPP path available
- Presenter narrative rehearsed
- Screenshots / recordings captured for fallback
