#!/bin/bash
# Expo Go launcher for Replit
# Sets EXPO_PUBLIC_API_BASE_URL automatically from the Replit domain

DOMAIN="${REPLIT_DEV_DOMAIN:-localhost:3000}"
export EXPO_PUBLIC_API_BASE_URL="https://${DOMAIN}"

echo ""
echo "🐴 Expo Go 启动器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "API 地址: $EXPO_PUBLIC_API_BASE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

export EXPO_USE_METRO_WORKSPACE_ROOT=1
npx expo start --tunnel
