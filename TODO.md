# KrabiClaw — Pending Setup Items

## WhatsApp — Register a Real Business Phone Number

**Status:** Blocked — using Meta test number (`+1 555-631-4537`, Phone Number ID `1070814412788109`). Custom variable templates are not allowed on test numbers.

**What to do:**
1. Go to [WhatsApp Manager → Phone numbers](https://business.facebook.com/latest/whatsapp_manager/phone-numbers/)
2. Click **Add phone number**
3. Add `+1 4233585761` (or any number you want as the KrabiClaw sender)
   - Must not be actively registered on personal WhatsApp — unregister it first if needed (Settings → Account → Delete account on the device)
4. Complete OTP verification via call or SMS
5. Once verified, copy the new **Phone Number ID** from the Phone numbers page
6. Update `.env`: `WHATSAPP_PHONE_NUMBER_ID=<new_id>`
7. Run: `printf '%s' '<new_id>' | wrangler pages secret put WHATSAPP_PHONE_NUMBER_ID --project-name kikuzuki-thailand-marketing`
8. Tell Claude — the 4 notification templates will be re-submitted automatically

**Templates to submit once number is verified** (code already written, just needs re-run):
- `draft_published` — fires when owner publishes content
- `new_review` — fires when a new review is received
- `ai_action_complete` — fires after AI menu extraction saves a draft
- `low_credits` — fires when AI credit balance drops to ≤ 50
- `new_contact_msg` — fires when a visitor submits the contact form (3 vars: guest name, email, message preview)
- `new_reservation` — fires when a visitor submits a reservation (5 vars: guest name, date, time, guests, phone)
- `otp_code` — WhatsApp login OTP, **AUTHENTICATION category** (1 var: 6-digit code)

**Why the current test number can't do this:**
Meta test numbers support only the pre-approved `hello_world` template. All custom templates submitted via the API are immediately auto-rejected with `INVALID_FORMAT` regardless of content.

---

## WhatsApp — Get a Permanent System User Access Token

**Status:** Using a temporary 24h access token (`EAAOfr4...`). Will expire.

**What to do:**
1. Go to [Meta Business Manager → System Users](https://business.facebook.com/settings/system-users)
2. Create a system user (e.g. `krabiclaw-api`)
3. Grant permissions: `whatsapp_business_messaging` + `whatsapp_business_management`
4. Generate token → copy it
5. Update `.env`: `WHATSAPP_ACCESS_TOKEN=<new_token>`
6. Run: `printf '%s' '<new_token>' | wrangler pages secret put WHATSAPP_ACCESS_TOKEN --project-name kikuzuki-thailand-marketing`
