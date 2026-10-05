# Licence decision (open)

**Status: undecided. No licence file exists, on purpose.**

The execution contract says not to invent a project licence. This page records
what has to be decided, by the repository owner, before outside contributions
are invited. Until then the default applies: all rights reserved, and nobody
may assume they can reuse this repository's contents.

## Decision 1: licence for this repository

What is here is research tooling, sanitized fixtures and documentation, all
original. Things to weigh:

| Option | Fits when | Watch for |
|---|---|---|
| Permissive (MIT / Apache-2.0) | the tools and fixtures should be reusable by anyone, including future product code | Apache-2.0 adds an explicit patent grant and a NOTICE convention |
| Copyleft (GPL / AGPL) | derivatives should stay open | constrains reuse inside a closed product |
| Source-available, noncommercial | the research should not be commercialised by others | incompatible with reuse in a commercial product by anyone, including this project, unless the owner dual-licenses |
| Separate licence for documentation and fixtures (for example CC BY 4.0) | prose and data should be citable under clearer terms than a code licence gives | two licences to keep straight |

A contributor agreement or a Developer Certificate of Origin sign-off should be
decided at the same time: the clean-room declaration in `CONTRIBUTING.md` is a
statement about provenance, not a licence grant.

## Decision 2: the runtime's lineage

The replacement runtime used for the live experiments lives in a separate
private repository and is an adaptation of a third-party server for a later
title, licensed **PolyForm Noncommercial 1.0.0**. That licence:

- requires its copyright notice and terms to travel with any copy or adaptation;
- permits noncommercial use only, permanently, not "for now".

The Master Spec describes a product platform with a runtime of its own
(`upnext-runtime`) and calls the research clean-room. Those cannot both rest on
that adaptation. The choices are:

1. keep the adapted runtime strictly as a private research instrument, and
   write the product runtime from this repository's evidence only, by people
   or processes that do not copy from the adapted code; or
2. keep the whole project permanently noncommercial and comply with the
   upstream licence in full; or
3. obtain a different licence from the upstream author.

Nothing in this repository copies runtime source: the tools load the runtime's
codec by path at run time, and the ledgers label inherited handlers as
REFERENCE. That separation should be kept whichever option is chosen.

## Decision 3: legal review

Independent of licensing, the Master Spec already flags items that need a
lawyer rather than an engineer: interoperability with a discontinued
commercial service, the client supply requirement, retention policy, and any
form of monetisation. This page does not attempt to answer them.

## Until decided

- no `LICENSE` file is added;
- pull requests from outside contributors are not merged;
- `project-state.json` carries this as blockers B5 and B7.
