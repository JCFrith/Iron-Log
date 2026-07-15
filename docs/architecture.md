# Iron Log v2 Architecture

## Overview

Iron Log v2 is a single-page fitness dashboard and prototype AI fitness operating system. The browser UI is currently delivered as a static HTML file, with Supabase providing authentication and persistence. The user experience spans training, recovery, nutrition, body composition, exercise intelligence, records, optional social features, and coach visibility.

```text
Browser (index.html)
  ├─ Static UI, local demo state, and navigation
  └─ Supabase JavaScript client
       ├─ Supabase Auth
       ├─ PostgreSQL tables + Row Level Security
       └─ External data integrations (WHOOP data is read by the UI)
```

## Application layer

`index.html` contains the entire client application:

- The page-specific functions render the dashboard, workout, analytics, nutrition, body, trainer, library, records, social, and coach views.
- The `S` object keeps ephemeral UI state such as the active page, readiness, and current mission.
- `hydrate()` checks the Supabase session, then fetches the signed-in user's profile, latest WHOOP day, and logs. If there is no session, the app remains usable in demo mode.
- The Supabase URL and publishable client key are embedded in the client. This is appropriate only for public client credentials; database access must be enforced by Row Level Security (RLS).

The interface currently contains seeded display data and simple client-side interactions. It should be treated as a prototype shell until views write the corresponding records to Supabase.

## Data layer

The v2 foundation migration at `supabase/migrations/20260714_iron_log_v2_foundation.sql` defines the following data domains.

| Domain | Tables | Purpose |
| --- | --- | --- |
| User configuration | `user_preferences` | Goals, equipment, injuries, training preferences, and AI memory. |
| Body composition | `body_measurements` | Timestamped weight, composition, circumference, source, and notes. |
| Nutrition | `nutrition_days`, `meals` | Daily macro and hydration totals plus individual meals. |
| Exercise knowledge | `exercise_library` | Shared exercise metadata, technique, alternatives, and media. |
| Performance history | `personal_records` | User-specific performance records and estimated 1RM data. |
| AI output | `ai_recommendations` | Prioritized, expirable recommendations and supporting data. |
| Gamification | `achievements`, `user_achievements` | Shared achievement definitions and earned achievements. |

Most user-owned data is keyed by `user_id`, which references `auth.users(id)` and cascades on account deletion. Shared catalog data uses independent identifiers.

## Authorization model

Supabase RLS is enabled on all user-owned v2 tables. The standard policy pattern permits a user to access only rows whose `user_id` equals `auth.uid()`.

- `exercise_library` and `achievements` are readable by any authenticated user.
- A coach may read `body_measurements` and `personal_records` through the `me_is_coach()` helper function.
- `ai_recommendations` and `user_achievements` are currently readable by their owner only; creating or updating them is intended for a trusted backend/service role unless additional policies are introduced.

The foundation migration references `me_is_coach()`. That function, as well as the `profiles`, `whoop_days`, and `logs` tables queried by the browser, must exist in the pre-existing database schema before the v2 application can fully hydrate production data.

## Key data flows

### Startup and hydration

1. The browser renders the static dashboard and demo values.
2. The Supabase client obtains the current authenticated session.
3. If authenticated, it reads profile, latest WHOOP recovery data, and logs for that user.
4. The UI substitutes available live values and marks the connection synchronized; failures leave the user in partial-data mode.

### User data

1. User actions should write measurements, meals, preferences, workout-derived records, and recommendation outcomes through Supabase.
2. RLS limits each operation to the signed-in user's records.
3. Analytics and AI-generated plans consume the user's history, preferences, recovery, and exercise-library metadata.

### Coach access

1. A coach is identified by the database's `me_is_coach()` authorization helper.
2. RLS permits that coach to read the specific athlete data exposed by the policies.
3. The current UI provides a coach dashboard mockup; athlete-to-coach assignment and coach notes need dedicated schema and policies before this becomes a production workflow.

## Implementation considerations

- Keep privileged work—AI generation, recommendations, and third-party data ingestion—behind server-side functions or a service role. Do not place privileged keys in the client.
- Add write paths, validation, and clear ownership semantics before replacing the demo values in the UI.
- Define foreign keys for session references such as `personal_records.source_session_id` once the workout-session model is finalized.
- Add migrations for dependencies referenced by the application (`profiles`, `whoop_days`, `logs`, and `me_is_coach()`) or update the client to use the v2 tables exclusively.
- Test every RLS policy with separate athlete, coach, and unauthenticated sessions before deployment.
