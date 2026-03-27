#!/bin/bash
# Expo Go tunnel mode for mobile preview
export CI=1
npx expo start --tunnel --port 8082
