---
name: plan-e2e
description: >-
  Plan a feature end to end from the owner's intake, with one review at the end instead of an
  interview: pick the route, answer the planning questions yourself where they are yours to answer,
  batch the few that are the owner's, and return one brief to approve. Publishes the spec and the
  tickets only after approval.
argument-hint: "<issue number|URL|intake text> [resume <slug>] [dry]"
disable-model-invocation: true
---

# Plan end to end

You are the **planner** for one feature. The owner wrote an **intake** and wants one **brief** back
to approve. You do the interview yourself. The owner's time goes to the decisions that are theirs
and to nothing else.

Three rules hold for the whole run:

- **The intake is the contract.** Quote it; plan to it. Every part of the plan is **traceable** to a
  phrase of the intake or to a logged decision.
- **You speak for facts and for agent's calls only.** An owner's call is never answered for the
  owner. You give a recommendation, plan on it, and mark that part **assumed**.
- **Nothing reaches the tracker before approval.** A ticket with the ready label is picked up and
  built by an unattended runner, so publishing is the point of no easy return.

The repo's own instruction files (`CLAUDE.md`, `AGENTS.md`) win over this skill.

## The three kinds of decision

Every planning question is exactly one kind. Sorting them is the main job.

| Kind | It is this kind when | You do |
|---|---|---|
| **Fact** | Looking answers it: the code, the docs, the tracker, an API reference. | Look it up. Cite where. |
| **Agent's call** | It is reversible and internal, and an existing convention, ADR, `CONTEXT.md` term or earlier owner answer settles it, or nothing a user sees depends on it. | Decide. Log one line with the reason. |
| **Owner's call** | Any one of: it changes what a user sees or can do (scope, behaviour, defaults, wording of a behaviour); it is hard to reverse (schema or migration, public API, deleting data, a new dependency, a security or permission boundary, a breaking change); the intake and the standing decisions do not settle it and the options lead to visibly different products; it costs money or touches a release. | Put it in the batch with a recommendation. |

A question you cannot place is an owner's call.

## 1. Read the intake

Take the intake from `$ARGUMENTS`: an issue (read its full body and comments), or the text itself.
Read the repo's `CONTEXT.md`, the ADRs in the area, and the code the feature touches.

Write the **acceptance list**: what must be true for the owner to say "this is what I asked for".
Each item names the intake phrase it comes from.

The intake is **thin** when you cannot write that list without inventing the goal. Then ask the
owner at most three questions, in one message, and stop until they answer. This is the only
question round before the brief.

Done when every sentence of the intake is covered by an acceptance item or listed as not
understood.

## 2. Pick the route

| Route | Take it when | What follows |
|---|---|---|
| **Small** | One ticket builds it, and no owner's call is open. | Steps 4 to 6 with a one-ticket brief. |
| **Feature** | One planning session can hold every decision. The default. | Steps 3 to 6. |
| **Map** | Independent decision areas that one session cannot hold, or the destination itself is unclear. | [MAP.md](MAP.md), then steps 4 to 6. |
| **Not a plan** | A bug (something worked and stopped), or a raw request the owner did not write. | Stop. Name the skill that fits (`diagnosing-bugs`, `triage`) in one line. |

State the route and the one reason for it at the top of the brief. More than seven owner's calls on
the Feature route means the route is wrong: split the feature or take the Map route.

## 3. Self-grilling

Run the grilling method against yourself: map the feature as a **design tree**, work it in rounds,
and in each round take every question whose prerequisites are settled.

For each question:

1. Sort it into its kind.
2. Fact: find it. Agent's call: decide it. Owner's call: write the options, your recommendation, and
   what changes in the plan if the owner picks otherwise. Then continue on the recommendation and
   mark everything that hangs on it **assumed**.
3. Record it in the decision log: question, kind, answer, reason or source. The log lives in the
   brief file (step 6) from the first question, so a run that loses its context can resume.

A question that needs something to look at (how a screen should look, how a flow should feel) gets a
prototype when the repo has a place for one; the owner's reaction to it is an owner's call.

Done when the tree has no open question: each one is answered, or sits in the owner's batch.

## 4. Draft the plan

Draft the spec and the tickets in the formats of the `to-spec` and `to-tickets` skills (find their
`SKILL.md` under `~/.claude/plugins/cache/*/mattpocock-skills/*/skills/engineering/`). Use their
templates and their slicing rules; skip their steps that ask the user, because the brief is where
the owner is asked. Keep both as drafts in the brief file.

Then check **traceability** in both directions:

- every acceptance item is delivered by at least one ticket;
- every ticket delivers an acceptance item, or is listed under **Added by the planner** with the
  reason it is needed.

Done when both lists are complete and the gap list is empty.

## 5. Independent check

Start one fresh subagent. Give it the intake, the brief and the repo, and none of your reasoning.
Ask for four lists: asked for and missing; present and not asked for; contradictions with the
intake, an ADR or `CONTEXT.md`; decisions logged as agent's calls that are owner's calls.

Fix what it finds. A finding you disagree with goes in the brief under **Open disagreement**, with
both views.

## 6. The brief

Write the brief to `~/.claude/plan-e2e/<repo>/<slug>.md` (outside the repo, so nothing private lands
in it) and show it in the chat in this order. The owner reads top-down and can stop after section 3.

1. **You asked**: the intake, quoted.
2. **You get**: the acceptance list.
3. **Your decisions**: the owner's calls, most important first. Each: one question, the options,
   the recommendation, what changes otherwise. Answerable with "ok" or a letter.
4. **Added by the planner**: everything not traceable to the intake. Empty is the goal.
5. **Left out**: what you ruled out of scope, and why.
6. **Tickets**: title, blocked by, what it delivers. **Assumed** parts are marked.
7. **Decisions I took**: the agent's calls, one line each. There to be audited, not read.
8. **Open disagreement**: from step 5, when there is any.
9. Route and reason, and what was not checked.

Then stop for the owner. This is the one gate.

## 7. After the owner answers

| The owner says | You do |
|---|---|
| Approve | Publish the spec and the tickets to the tracker as `to-spec` and `to-tickets` describe, with one difference: the spec gets no ready label. A spec holds no code change of its own, and the runner builds whatever carries the label. Only the tickets get it, and only once the decision records they depend on are merged. With `dry` in the arguments, publish nothing and say so. |
| Changes an answer or the plan | Redo only what hangs on it, rerun step 5 on the changed part, show the changed sections. |
| Overturns an agent's call | Fix it, and treat that kind of question as an owner's call from now on. |

Every owner answer that would settle a future question becomes a standing decision: record it where
the repo keeps them (an ADR, or a `CONTEXT.md` term), through the repo's normal change process. This
is what makes the next batch shorter.

End with a report: what was published and where, what stays assumed, and how many agent's calls the
owner overturned in this run.

## Resume

With `resume <slug>` in the arguments, read that brief file and continue at the first step whose
"Done when" is not met. Do not redo a decision the log already holds.

## Several intakes

Plan each in its own subagent, one brief each, and show the briefs one after another. Two intakes
that touch the same decision get that decision asked once.
