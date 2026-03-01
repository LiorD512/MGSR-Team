# Firestore "Missing or insufficient permissions" – Troubleshooting

When adding a player (men or women), you may see:

> **Missing or insufficient permissions**

This is a Firestore security rules error. Here’s how to fix it.

## 1. Deploy Firestore rules

Rules in the repo must be deployed to your Firebase project:

```bash
firebase deploy --only firestore
```

Or only rules:

```bash
firebase deploy --only firestore:rules
```

## 2. Confirm you’re logged in

- You must be signed in when adding a player.
- If the session expired, log out and log in again.

## 3. Check Firebase project

- Ensure `.env.local` (or your env) points to the correct Firebase project.
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must match the project where rules are deployed.

## 4. Verify rules in Firebase Console

1. Open [Firebase Console](https://console.firebase.google.com) → your project.
2. Go to **Firestore Database** → **Rules**.
3. Confirm `Players`, `PlayersWomen`, `Portfolio`, and `PortfolioWomen` allow write for authenticated users:

```
match /Players/{playerId} {
  allow read, write: if request.auth != null;
}
match /PlayersWomen/{playerId} {
  allow read, write: if request.auth != null;
}
match /Portfolio/{docId} {
  allow read, write: if request.auth != null;
}
match /PortfolioWomen/{docId} {
  allow read, write: if request.auth != null;
}
```

## 5. Auth domain

- If using custom auth domain, ensure it’s configured in Firebase Auth.
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` must match your auth setup.
