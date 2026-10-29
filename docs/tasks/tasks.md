---
title: Tasks
description: Deferred work in moid — one file each, every one with a done state
created: 2026-10-29
updated: 2026-10-29
contents:
  - "[The check character overflows a 32-bit sum](check-char-overflows-a-32-bit-sum.md)"
---

# Tasks

Work this workspace has committed to and has not done yet, one document each.
A bug is a task with a repro; anything else is a task with a done state
written down, so that finishing it is a fact rather than an opinion.

`contents` above lists every task, open and closed. Closing a task is an
edit, not a delete: its `status` becomes `done` or `dropped`, and it names
the commit or release that resolved it.

`status` takes `open`, `in-progress`, `done`, or `dropped`, and nothing else,
so that a tool can read it across every repository in the org.
