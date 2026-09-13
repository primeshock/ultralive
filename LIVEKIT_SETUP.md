# LiveKit production setup

Koosha Live is already wired for LiveKit but keeps RTMP/NMS/HLS as fallback.

## Required topology

```text
OBS
 ├── fallback: RTMP -> node-media-server -> HLS
 └── primary:   RTMP -> LiveKit Ingress -> LiveKit SFU -> WebRTC
```

OBS sends one combined program output. Camera/screen/mic are therefore synchronized before they reach either ingest path.

## Self-hosted requirements

Use the current LiveKit VM deployment/generator for production. It provisions LiveKit Server, Caddy/TLS and Redis, with optional Ingress/Egress.

Required DNS:

- `livekit.example.com` -> server public IP
- `turn.livekit.example.com` -> same public IP (if using the generated TURN setup)

Required public ports for the current LiveKit VM setup:

- TCP 80 (certificate issuance)
- TCP 443 (HTTPS/WSS and TURN/TLS)
- TCP 7881 (WebRTC over TCP)
- UDP 3478 (TURN/UDP)
- UDP 50000-60000 (WebRTC media)
- TCP 1935 (RTMP Ingress)
- UDP 7885 if WHIP Ingress is enabled

## Backend environment

```env
LIVEKIT_ENABLED=true
LIVEKIT_URL=https://livekit.example.com
LIVEKIT_WS_URL=wss://livekit.example.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

Then rebuild/restart the backend and frontend so the frontend feature flag is enabled.

## Provisioning a class ingress

From the Admin panel select a class and click `ساخت LiveKit Ingress`.

The backend calls LiveKit `CreateIngress(RTMP_INPUT)` and stores the resulting ingress ID, RTMP URL and stream key for that class.

Put the returned URL in OBS -> Settings -> Stream -> Custom and the returned stream key in Stream Key.

## Webhook

Configure the LiveKit server webhook URL as:

```text
https://YOUR-KOOSHA-DOMAIN/api/livekit/webhook
```

The backend verifies the signed webhook body with the LiveKit server API key/secret and updates the class `isLive` state on `ingress_started` / `ingress_ended`.

## Cutover rule

Do not disable the existing RTMP/NMS/HLS path until all of these pass:

1. OBS can publish to LiveKit Ingress.
2. Student browser receives the combined audio/video over WebRTC.
3. TURN works from a restrictive network.
4. reconnect works after temporary network loss.
5. LiveKit webhook updates live/offline state.
6. HLS fallback still works.
7. At least one real-class soak test completes without media loss.

Only after those tests should `NEXT_PUBLIC_LIVEKIT_ENABLED=true` be considered production-ready.
