# STORE Mobile

Lightweight Expo React Native worker app scaffold for STORE.

## What is set up

- Expo managed workflow
- TypeScript strict mode
- React Navigation root stack + bottom tabs
- Secure token storage with `expo-secure-store`
- Offline queue storage with `expo-sqlite`
- React Query client and envelope-aware API client
- Minimal monochrome UI shells for the worker workflow

## Requirements

Download and install:

1. [Node.js 20+](https://nodejs.org/)
2. [Expo Go](https://expo.dev/go) on your device, or Android Studio/Xcode for simulators
3. A running backend from Module 1

## Quick Start

```bash
cd mobile
npm install
npx expo start
```

## Environment

Copy `.env.example` to `.env` and set the backend URL:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Notes

- The app is intentionally lightweight and modular.
- Offline queue plumbing is in place for sales, returns, and tickets.
- Login, profile hydration, and sync are scaffolded to match the backend structure without adding unnecessary UI weight.
- Push notifications, close-shop flow, and richer worker actions can be layered in next.
