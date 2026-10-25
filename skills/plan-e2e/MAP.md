# The Map route

For an intake too large or too unclear for one planning session. It uses the wayfinder method (find
its `SKILL.md` under `~/.claude/plugins/cache/*/mattpocock-skills/*/skills/engineering/wayfinder/`
and read it for the map, the ticket types, the fog and the out-of-scope rules). What changes here is
who resolves a ticket.

## 1. Destination first

Write the **destination** in one or two lines from the intake, with the acceptance list from step 1
of the skill. Show both to the owner and stop. Everything on the map hangs on the destination, so
this is a second gate, and the only extra one.

## 2. Chart the map

Keep the map and its decision tickets in the brief file, in wayfinder's shape (Destination, Notes,
Decisions so far, Not yet specified, Out of scope). Nothing goes to the tracker yet.

## 3. Resolve the tickets

One ticket per subagent, so each has a fresh context. Run the unblocked ones in parallel.

| Ticket type | Who resolves it |
|---|---|
| Research | A subagent. Its answer is a fact with sources. |
| Task | A subagent when it can be done with the access you have. Otherwise it is an owner's call: a checklist for the owner. |
| Grilling | A subagent runs step 3 of the skill on that one question. It returns the decision log and any owner's calls. |
| Prototype | A subagent builds it where the repo allows. The owner's reaction is an owner's call. |

After each resolution: add its line to Decisions so far, turn fog into tickets where the answer made
that possible, and rule out of scope what sits past the destination.

A ticket blocked by an owner's call proceeds on the recommendation and is marked **assumed**, like
any other part of the plan. When more than a third of the map is assumed, stop and take the owner's
batch to the owner early: a wrong assumption that deep costs more than the wait.

Done when no open ticket and no fog remain.

## 4. Back to the skill

Continue at step 4 of the skill with the map's decisions as the decision log.
