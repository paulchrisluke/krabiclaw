# Dashboard navigation: Airbnb reference and the KrabiClaw plan

Captures: `goal/airbnb/hosting/**` (phone, 520px) and `goal/airbnb-desktop/hosting/**` (1440px).
Traced 2026-09-20 against a real host account by clicking the real controls and reading `location.href` after each.

## 1. Airbnb routes and where Back goes

| Screen | Route | Header | Back goes to | Bottom nav |
|---|---|---|---|---|
| Today | `/hosting` | Today / Upcoming pills | — (tab root) | yes |
| Calendar | `/multicalendar` | — | — (tab root) | yes |
| Listings | `/hosting/listings` | title, list-view toggle, `+` | — (tab root) | yes |
| Listing editor | `/hosting/listings/editor/:id/details` | Back · "Listing editor" · gear; tabs *Your space* / *Arrival guide* | `/hosting/listings` | yes |
| Editor leaf (Title) | `…/details/title` | Back · Close (sheet over the editor) | `…/details` | yes |
| Editor nested list (Description) | `…/details/description` | Back | `…/details` | yes |
| Editor nested leaf | `…/details/description/listing-description` | Cancel · Save (sheet) | closes to `…/details/description` | yes |
| Arrival guide tab | `…/arrival` | same header, tab switched | `/hosting/listings` | yes |
| Arrival leaf (Wifi) | `…/arrival/wifi-details` | Back · Close | `…/arrival` (tab preserved) | yes |
| Preferences (gear) | `…/preferences` | Back · "Edit preferences" | `…/details` | yes |
| Preferences leaf (Status) | `…/preferences/status` | Back | `…/preferences` | yes |
| Messages | `/hosting/messages` | "Messages" · Search · Messaging Settings; filter pills | — (tab root) | yes |
| Menu | `/hosting/menu` | bell · avatar; "Menu" | — (tab root) | yes |
| Notifications (bell) | overlay on `/hosting/menu` | Back · "Notifications" | closes | yes |
| Earnings | `/earnings` | Back · gear | previous | yes |
| Insights | `/performance/quality/overall` | hamburger side nav | — | yes |
| Account settings | `/account-settings` | Back · "Account settings"; icon rows | `/hosting/menu` | **no** |
| Account settings leaf | `/account-settings/personal-info` etc. | Back · H1; value rows with inline *Edit* | `/account-settings` | **no** |
| Profile (avatar) | `/users/profile/about` | Back · *Edit* | previous | **no** |
| Edit profile | `…?editMode=true` | X · "Edit profile" · Done (sheet) | closes | — |

Desktop (1440): the tab bar becomes a top nav (Today · Calendar · Listings · Messages), Menu is a slideover from the hamburger with the identical list plus a bell. Account settings is two columns, list left and leaf right, the first leaf open by default, a single **Done** button top right and no top nav. Listing editor is two columns the same way (see `goal/airbnb-desktop/hosting/listings/editor/`).

### Rules Airbnb follows

1. **Five tab roots, each the top of its own stack.** Today, Calendar, Listings, Messages, Menu. A root has no Back.
2. **Every other screen has exactly one declared parent, one level up.** Back is a push to that parent, not `history.back()` (history length grows on every Back). A leaf goes to its list; a list goes to the thing it belongs to; the editor goes to Listings.
3. **Index and leaf are one level.** On a phone the leaf covers the list; on desktop they sit side by side. Back from the list and Back from the leaf are two different controls with two different targets.
4. **Settings is a leaf list behind a gear, titled for what it is** ("Edit preferences", "Account settings"). Guest-visible things are cards on the hub; things a guest never sees are behind the gear.
5. **Menu is one flat page**: two stat cards, one promo card, plain icon rows, Log out last. Account settings is a *row* on Menu, and Profile hangs off the avatar. Nothing on Menu duplicates a tab.
6. **A leaf shows the value and edits in place.** Account leaves are rows of *Label / value / Edit* that expand inline. Editor leaves are one field, a character counter, Cancel and Save.
7. **Tabs split one object's aspects** (*Your space* / *Arrival guide*), each with its own leaf list, and a leaf's Back keeps the tab.

## 2. KrabiClaw today, and what breaks the rules

Routes as of `staging` `9d432f09`:

```
/dashboard/:org                         Today (tab root)
/dashboard/:org/calendar                Calendar (tab root)
/dashboard/:org/sites                   Sites (tab root): site tiles + location tiles
/dashboard/:org/messages                Messages (tab root; org inbox, rows re-root into a site)
/dashboard/:org/menu                    Menu (tab root)                                   ← duplicate of /settings
/dashboard/:org/settings                "Organization Settings" list, Back → Menu          ← duplicate of /menu
/dashboard/:org/settings/<leaf>         general · appearance · members · billing · connect · analytics · chatgpt; Back → /settings
/dashboard/:org/notifications           bell; Back → Today                                ← wrong parent
/dashboard/:org/insights                Back → Today                                      ← wrong parent
/dashboard/account/profile              "Account"; Back → /dashboard (org picker)          ← wrong parent
/dashboard/account/profile/<leaf>       photo · name · sign-in · phone · delete
/dashboard/account/profile/notifications
/dashboard/:org/sites/:site             Site hub: Locations · Pages · Blog · Reviews and Q&A · Brand · (People); gear
/dashboard/:org/sites/:site/locations   locations list; Back → Site                       ← extra hop
/dashboard/:org/sites/:site/locations/new
/dashboard/:org/sites/:site/settings    "Site Settings": Domain · Localization | Currency · Notifications · Search and analytics · Facebook publishing · Delete workspace
/dashboard/:org/sites/:site/settings/search/{analytics,verification,visibility}           ← nested list inside settings
/dashboard/:org/sites/:site/settings/domains
/dashboard/:org/sites/:site/brand/<leaf> name · logo · sharing-image · description · color · font · contact · social; header "Localize"
/dashboard/:org/sites/:site/{pages,blog,qa,links,messages,people}
/dashboard/:org/sites/:site/locations/:loc            Location hub: Photos · Name · Description · Hours · Address · Contact · Catalog · Posts · Reviews and Q&A · Reservations; gear
/dashboard/:org/sites/:site/locations/:loc/<detail>   name · description · hours · address · contact · reservations
/dashboard/:org/sites/:site/locations/:loc/settings   titled with the location name; header "Localize"; Status · Slug · Google · Notifications · Features
/dashboard/:org/sites/:site/locations/:loc/{photos,products,posts,qa,messages}
```

Breaks:

- **Two Menus.** `/menu` and `/settings` render the same list. A settings leaf's Back lands on `/settings`, a page you never came from.
- **Wrong parents.** Notifications and Insights go to Today; Account goes to the org picker.
- **Same endpoint, several doors.** Google Analytics at org settings *and* site settings. Billing on Menu *and* Account. Notifications on Account (channels), Site settings (WhatsApp number), Location settings (WhatsApp number) and the bell. Members at org *and* a site People page. Localization as a Site settings row *and* a header button on Brand *and* a header button on Location settings. Contact details in Brand *and* a Contact card on the location.
- **Three titles for one kind of screen.** "Organization Settings", "Site Settings", and the location's own name. Location settings with nothing open reports "Status" as the page title.
- **A list nested inside settings** ("Search and analytics" opens a second list of three).
- **Leaves are chevron chains.** A value is three screens deep (list → row → field page), with helper paragraphs on each. Airbnb shows the value on the row and edits inline.
- **Locations is an extra hop** from the site hub (card → list → location), while the Sites tab already reaches a location in one tap.

## 3. The hierarchy, as built

**One business.** Every organization in production has exactly one site (six of six, 2026-09-21). Organization and site are the same thing for every customer, so the dashboard no longer has a layer for choosing between sites. Airbnb is account → listings; ours is business → locations.

Tab roots: **Today · Calendar · Locations · Messages · Menu**. Bottom bar on phones, top nav on `md+` with Menu as a slideover. Back is the browser's back everywhere below a root.

### Locations → `/sites`   tab root
Airbnb's Listings: one tile per location with its hero photograph and address, `+` for a new one, one tap into a location. There is no site hub and no site index; `/sites/:siteSlug` on its own redirects here.

### Location hub → `/sites/:site/locations/:loc`   gear → Settings
Cards unchanged: Photos · Name · Description · Hours · Address · Contact · Catalog · Posts · Reviews and Q&A · Reservations.

### Location settings → `…/:loc/settings`   title "Settings"
Status · Link · Languages (Localize) · Google Business Profile · WhatsApp number · Features

### Menu → `/settings`   tab root · bell · avatar
The business's own page, as Airbnb's Menu is the host's. Org switcher · Search · Insights card, then:

Pages · Blog · Reviews and Q&A · Brand · Website · Team · Billing · Payouts · **Log out**

Pages, Blog and Reviews and Q&A open the site's lists. **Brand** is the guest-facing identity: name, logo, social sharing image, description, colour, font, contact, social profiles, Translations (Localize). **Website** is what a guest never sees: Domain · Languages · Currency · WhatsApp number · Search engines · Google Analytics · Facebook publishing · Delete site. Notifications and Insights live under Menu.

The **Organization** row is gone: the organization *is* the business, so its name follows the brand name on every brand-name save. Google (a site picker in front of Website's rows), ChatGPT (setup text for the docs) and Appearance (a per-device preference, now on Account) are gone too.

### Account → `/account/profile`   title "Account settings"
Display name · Login & security · WhatsApp number · Notifications · Appearance · **Log out**. Login & security holds email, password, Google, the signed-in devices (Better Auth sessions, each with its own Log out) and Delete account at the bottom.

### Messages
The site inbox is the one inbox below the organization. The two production editors are WhatsApp recipients who never sign in, so no signed-in user is scoped to one location and the location inbox is gone.

### Taps from a tab root
Locations → location → Hours → edit: 3, Airbnb's number. Menu → Pages → page: 2. Menu → Brand → Brand name → edit: 3.

## 4. Leaves

Airbnb's two leaf shapes, both in the captures:

- **Settings leaf** (`account-settings/personal-info`): H1, then rows *Label / current value / Edit*. Edit expands the row in place with a field and Save/Cancel. One screen for the whole leaf.
- **Editor leaf** (`details/title`): one field, a `n/50 available` counter, Cancel and Save in a footer; on a phone it is a sheet with a Close control over the editor.

Ours: every settings row opens another page with one field and a paragraph of guidance above it. Change: settings leaves (org, site, location, account) render value rows that edit in place; hub leaves keep the one-field pair with the Save footer they already have; helper paragraphs go. Copy and spacing come after the hierarchy lands.

## 5. Deletions

- `pages/dashboard/[orgSlug]/settings/index.vue` (duplicate of Menu)
- the site hub and site index (`sites/[siteSlug].vue` is a passthrough; `sites/index.vue` is the Locations tab); `sites/new.vue`; the org `general` page
- `settings/search/*` nested list (three rows flatten into the settings list)
- Localize header buttons on Brand and Location settings (rows instead)
- Billing row on Account; ChatGPT, Google and Appearance rows on Menu (Appearance moves to Account)
- the location inbox page and location scope in the thread list
- helper paragraphs on every settings leaf

## 6. Decisions taken

- **People** on KrabiClaw's own site stays: it is the platform's impersonation tool, not a members list, and has no other door.
- **Leaves that edit in place** (section 4) are the next PR. This one fixes the hierarchy, the routes and Back.

- **Organization = site = business.** No site hub, no site index, no second site. If a second site ever exists, the switcher in Menu's header is where it surfaces.
- Rows stay **flat on Menu** rather than behind one "Settings" row: fewer pages, and Menu is already the list.
- **Location-only dashboard access is removed**; everyone who signs in sees the whole site.
- Bottom nav **stays** on Account and settings screens. Airbnb drops it there; keeping it is one code path.
- Back is **the browser's back**, with `/dashboard` as the only fallback. The explicit target prop is deleted.
