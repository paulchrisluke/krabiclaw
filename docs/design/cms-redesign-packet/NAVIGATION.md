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

## 3. Proposed hierarchy

Tab roots unchanged: **Today · Calendar · Sites · Messages · Menu**. Bottom bar on phones, top nav on `md+` with Menu as a slideover. Every non-root screen declares one parent; `DashboardNavbarLeading` already models this, only the targets change.

### Sites tab → `/sites`
Site tiles and location tiles, as today (a location is one tap away, like a listing). `+` for a new site.

### Site hub → `/sites/:site`   Back → Sites · gear → Settings
Tabs, the way the listing editor splits *Your space* / *Arrival guide*:

- **Site**: Pages · Blog · Reviews and Q&A · Brand — one card per thing a visitor meets, stating its value.
- **Locations**: location tiles · New location.

The `locations/index.vue` page is deleted; the tab is the list. Brand stays a hub card because a visitor sees it. A leaf's Back returns to the hub with the tab it came from.

### Site settings → `/sites/:site/settings`   title "Settings" · Back → Site hub
Flat rows, value on the row:

Domain · Languages · Currency · WhatsApp number · Search engines (visibility + verification, one leaf) · Google Analytics (measurement id) · Facebook publishing · Delete site

Deleted: the nested "Search and analytics" list; the header Localize button on Brand (Languages is the row).

### Location hub → `/sites/:site/locations/:loc`   Back → Site hub (Locations tab) · gear → Settings
Cards unchanged: Photos · Name · Description · Hours · Address · Contact · Catalog · Posts · Reviews and Q&A · Reservations.

### Location settings → `…/:loc/settings`   title "Settings" · Back → Location hub
Status · Link (slug) · Languages (the header Localize button becomes this row) · Google Business Profile · WhatsApp number · Features

Airbnb ends this list with *Remove listing*; we have no delete-location endpoint, so no row until there is one.

### Menu → `/menu`   tab root · bell · avatar
Org switcher · Search · Insights card, then rows:

Organization (name, logo, slug) · Team (members) · Billing · Payouts (Stripe Connect), then **Log out** last, as on Airbnb's Menu.

Deleted from Menu: **Google** (it was a site picker in front of the two site-level rows Site settings already has); **ChatGPT** (a static page of MCP setup text — belongs in platform docs or marketing, removed from the CMS entirely); **Appearance** (a per-device preference, moves to Account).

`/settings` index is deleted. Leaves stay at `/settings/<leaf>`; their parent is Menu. On `lg` the pair is Menu-list left, leaf right, first leaf open by default, as Airbnb's Account settings does.

### Account → `/account/profile`   title "Account settings" · parent Menu (active org)
Profile photo · Display name · Login & security · WhatsApp number · Notifications · Appearance · **Log out** last (Airbnb has Log out on both Menu and Profile; same here).

**Login & security** replaces today's Sign in leaf and takes Airbnb's shape (`goal/airbnb/hosting/account-settings/login-and-security/`): a *Login* section with Email (verified state), Password (*Update*, using the existing reset flow), Google (connected state); a *Device history* section listing Better Auth sessions with the current one marked and *Log out* per row (`listSessions` / `revokeSession`, both already in Better Auth core, nothing new server-side); and **Delete account** at the bottom, behind its own confirmation.

**Delete account** leaves the list. Today it sits directly above Log out, one mis-tap from the wrong irreversible action. It lives at the bottom of **Login & security**, where Airbnb keeps *Deactivate your account*.

Deleted from Account: Billing (it is on Menu).

### Notifications (bell) → `/notifications`   Back → Menu
### Insights → `/insights`   Back → Menu
### Messages
Production has 19 members: 8 owners, 9 admins, 2 editors. The two editors are WhatsApp phone identities (`phone-…@phone.krabiclaw.local`) on location teams; they have never signed in. The scoped role exists only to route WhatsApp messages to the right recipient. So: **no signed-in user is ever restricted to one location.** The location inbox page and the `scope="location"` branch of the thread list are deleted; the site inbox with its location filter is the one inbox below the org view. The `editor` role and team tables stay for WhatsApp routing, surfaced as Location settings → WhatsApp number and Account → Notifications.

### Back
Nuxt's nested directories decide what renders inside what; they do not draw a Back or choose its target. `DashboardNavbarLeading` takes an explicit `to`, and that is why four screens point at the wrong parent. Once the tree above is real (Menu is `/settings`' parent, Notifications and Insights live under Menu, Account's parent is Menu), the parent is `route.matched[-2]` with params filled, derived once in the leading control. The `to` prop and every hand-written target are then deleted. Nobody has ever wanted a Back that goes anywhere other than up one level.

## 4. Leaves

Airbnb's two leaf shapes, both in the captures:

- **Settings leaf** (`account-settings/personal-info`): H1, then rows *Label / current value / Edit*. Edit expands the row in place with a field and Save/Cancel. One screen for the whole leaf.
- **Editor leaf** (`details/title`): one field, a `n/50 available` counter, Cancel and Save in a footer; on a phone it is a sheet with a Close control over the editor.

Ours: every settings row opens another page with one field and a paragraph of guidance above it. Change: settings leaves (org, site, location, account) render value rows that edit in place; hub leaves keep the one-field pair with the Save footer they already have; helper paragraphs go. Copy and spacing come after the hierarchy lands.

## 5. Deletions

- `pages/dashboard/[orgSlug]/settings/index.vue` (duplicate of Menu)
- `pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/index.vue` (becomes the Locations tab)
- `settings/search/*` nested list (three rows flatten into the settings list)
- Localize header buttons on Brand and Location settings (rows instead)
- Billing row on Account; ChatGPT, Google and Appearance rows on Menu (Appearance moves to Account)
- the location inbox page and location scope in the thread list
- helper paragraphs on every settings leaf

## 6. Decisions taken

- **People** on KrabiClaw's own site stays: it is the platform's impersonation tool, not a members list, and has no other door.
- **Leaves that edit in place** (section 4) are the next PR. This one fixes the hierarchy, the routes and Back.

- Org settings rows stay **flat on Menu** rather than behind one "Settings" row: fewer pages, and Menu is already the list.
- **Location-only dashboard access is removed**; everyone who signs in sees the whole site.
- Bottom nav **stays** on Account and settings screens. Airbnb drops it there; keeping it is one code path.
- Back stays a **declared parent**, not browser history, which is also what Airbnb does.
