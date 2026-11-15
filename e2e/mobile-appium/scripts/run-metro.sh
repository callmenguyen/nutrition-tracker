#!/usr/bin/env bash
# Start the Expo Metro bundler for the debug APK (ADR-012). Run it in its own terminal.
# Points the app at the E2E mock backend (ADR-016) that run-test.sh starts; these variables
# take precedence over .env, which Expo does not let overwrite variables already set.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

# The phone reaches 127.0.0.1:<port> on this machine through `adb reverse` (run-test.sh).
export EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:${MOCK_BACKEND_PORT:-54399}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="mock-anon-key"
echo "[run-metro] App dùng mock backend $EXPO_PUBLIC_SUPABASE_URL (ADR-016)"

exec npx expo start --port 8081 "$@"
