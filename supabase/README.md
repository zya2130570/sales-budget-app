# V12.1 Supabase Schema Setup

This folder contains the first cloud-foundation work for the Sales Budget App.

Important:
- No Supabase client is installed yet.
- No auth UI exists yet.
- No runtime sync exists yet.
- localStorage is still the source of truth.

## Purpose of V12.1

V12.1 is schema planning and database setup only.

This version:
- defines the future database structure
- defines indexes
- defines basic Row Level Security policies
- preserves current local-first architecture
- prepares the app for future local-to-cloud sync

This version does NOT:
- sync transactions
- sync accounts
- sync goals
- upload imports
- migrate localStorage automatically

## Current architecture philosophy

The app remains:
- local-first
- offline-capable
- localStorage-driven

Supabase will become:
- persistence backup
- multi-device sync
- account ownership/auth
- recovery layer

NOT the immediate primary source of truth.

## Planned implementation order

### V12.2
- install Supabase client
- auth foundation
- guest/local mode
- profile creation

### V12.3
- local → cloud migration flow
- upload existing user data
- preserve local IDs where possible

### V12.4
- local-first sync
- write-through persistence
- retry/error handling

### V12.5
- backup/restore
- conflict handling
- import rollback handling
- duplicate resolution persistence

## Current known cloud risks

Highest-risk models before live sync:
- duplicate resolution groups
- import batch rollback
- transfer/payment relationships
- undo/redo boundaries
- category memory merge behavior
- budget actuals period structure

## Goal set behavior

Current goal sets are snapshot-based.

They intentionally store copies of goals at save time.

They are NOT live references to current goals.

Future sync implementations should preserve this behavior unless intentionally redesigned.
