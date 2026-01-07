# Cloud Functions (Push)

FCM tokens are stored per device under:

`users/{uid}/fcm_tokens/{tokenId}`

To actually send push notifications to **all devices** of a user (or all users), you must send via a **server** (Firebase Admin SDK). The client must not send pushes directly.

## Setup (one-time)

```bash
cd functions
npm i
```

## Deploy

```bash
firebase deploy --only functions
```


