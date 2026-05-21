-- Seed platform blog posts for KrabiClaw
-- Run against REVIEWS_DB (D1):
--   wrangler d1 execute krabiclaw-db --file=scripts/seed-platform-blog.sql --remote
--
-- author_id references the super-admin user. Replace <ADMIN_USER_ID> with the actual user ID
-- from the `user` table after first login. Or set to a placeholder if you want to insert manually.

-- Post 1: SEO for restaurants
INSERT OR IGNORE INTO platform_blog_posts (id, title, slug, body, excerpt, category, author_id, published_at, created_at, updated_at)
VALUES (
  'b1a2c3d4-e5f6-7890-abcd-ef1234567801',
  'How to Get Your Restaurant Found on Google — Without Spending on Ads',
  'how-to-get-your-restaurant-found-on-google',
  '## Why Most Restaurant Websites Are Invisible

A restaurant can have incredible food, a beautiful dining room, and five-star service — and still lose half its potential customers before they ever walk through the door. The reason is almost always the same: Google can''t find you, so customers can''t either.

This isn''t about running ads. It''s about the free, permanent visibility that comes from getting a few fundamentals right.

## Step 1: Claim and Complete Your Google Business Profile

If you haven''t done this yet, it''s the single highest-impact thing you can do today. A completed Google Business Profile (GBP) makes your restaurant appear in Google Maps, in the local "3-pack" that shows above search results, and in knowledge panels when someone searches your name directly.

**What to complete:**
- Business name (exactly as customers know you)
- Address and service area
- Opening hours — including holiday hours
- Phone number
- Website URL
- Category (e.g. "Japanese Restaurant", "Seafood Restaurant")
- Photos — at minimum: exterior, interior, and 3–5 menu items
- Menu link or embedded menu

Google rewards completeness. A profile with photos gets 42% more requests for directions and 35% more website clicks than one without.

## Step 2: Your Website Needs to Say What You Do, Clearly

Search engines are surprisingly literal. If your homepage says "Welcome to Saya Kitchen" but never uses the words "Japanese restaurant", "robatayaki", or "Krabi", Google has no strong signal to rank you for those searches.

**On your homepage, include:**
- Your cuisine type in the first paragraph
- Your location (city and neighborhood)
- A brief description of what makes you different
- Your hours and phone number in text (not just an image)

On KrabiClaw, every page is pre-structured for this. Your restaurant name, cuisine, location, and hours are rendered in semantic HTML that search engines can read easily.

## Step 3: Build Local Citations

A "citation" is anywhere online that lists your restaurant''s name, address, and phone number (NAP). Consistency matters — if your address appears slightly differently across sites (Road vs Rd, no unit number on one, different phone), Google loses confidence in your listing.

**Key places to list your restaurant:**
- Google Business Profile (primary)
- Facebook Business page
- TripAdvisor
- Yelp (even if you''re not in the US — Yelp indexes globally)
- Foursquare / Swarm
- Local tourism boards and food blogs

## Step 4: Collect Reviews Consistently

Reviews are a ranking signal. Restaurants with more recent, higher-rated reviews appear higher in local search results. "More recent" matters — a burst of 20 reviews three years ago is less valuable than a steady stream of 2–3 per month.

**How to get more reviews without being annoying:**
- Print a small card with a QR code linking directly to your Google review page — put it on tables or with the bill
- Send a WhatsApp message to repeat customers thanking them and including the link
- Reply to every review, positive and negative — it shows Google (and customers) that you''re active

## Step 5: Keep Your Information Up to Date

Nothing damages trust faster than a customer arriving to find you closed on a day Google said you were open. Update your hours for public holidays, seasonal closures, and any changes. On KrabiClaw, a single update syncs to your website and Google Business simultaneously.

## The Compounding Effect

SEO isn''t a one-time task. Every improvement compounds: more complete profile → better ranking → more clicks → more reviews → better ranking. The restaurants that dominate local search aren''t spending more on ads — they''re maintaining their presence more consistently than their competitors.

Start with Step 1 today. Seriously, right now.',
  'Most restaurants lose half their potential customers before they walk through the door — not from bad food but from poor visibility on Google. Here are the five steps that actually move the needle, for free.',
  'SEO',
  'system',
  '2026-05-07T09:00:00.000Z',
  '2026-05-07T09:00:00.000Z',
  '2026-05-07T09:00:00.000Z'
);

-- Post 2: Instagram for restaurants
INSERT OR IGNORE INTO platform_blog_posts (id, title, slug, body, excerpt, category, author_id, published_at, created_at, updated_at)
VALUES (
  'b1a2c3d4-e5f6-7890-abcd-ef1234567802',
  '5 Instagram Strategies That Actually Bring Customers Through the Door',
  '5-instagram-strategies-that-bring-customers-in',
  '## The Difference Between Instagram Followers and Restaurant Customers

Most restaurants that put effort into Instagram make the same mistake: they optimize for likes instead of visits. A beautiful feed with 10,000 followers means nothing if those followers are in different countries, or never convert to actual reservations.

Here''s how to use Instagram as a customer acquisition channel, not just a portfolio.

## 1. Post Your Location in Every Caption

This sounds obvious, but most restaurant accounts skip it. Your Reels might reach someone 50km away who happens to be visiting your area next month — but only if they know where you are.

**In every caption, include:**
- Your city and neighborhood ("📍 Ao Nang, Krabi")
- A call to action with your booking method ("Reserve via link in bio" or "Walk-ins welcome — we open at 5pm")

Instagram is also searchable by location. Posts tagged with your location (both the geotag and text in caption) show up when people search for restaurants in your area.

## 2. Reels Over Static Posts, Every Time

Since 2022, Instagram has deprioritized static images in reach. Reels consistently get 3–5x more views than photos for restaurant accounts.

**Easy Reels ideas that require no production budget:**
- 15-second dish reveal (plate being set down, steam rising)
- Quick walk-through of your restaurant before service
- One of your chefs doing something skillful — slicing sashimi, torching a dish
- Before/after of a prep element
- Customer reaction (with permission)

Aim for 3–4 Reels per week. Consistency matters more than production quality.

## 3. Use Instagram Stories as Your "Today" Channel

Stories disappear after 24 hours, which makes them perfect for real-time content: today''s special, a sold-out dish, a last-minute table that opened up. Customers who follow you on Stories are your highest-intent audience.

**Stories that convert:**
- "We have 3 tables left tonight — DM us to reserve"
- "Tonight''s special: [dish], only 8 portions"
- "We''re open until midnight on Fridays"

Pin your best Stories to Highlights: Menu, Hours, Location, Reservations.

## 4. Respond to Every DM Within 2 Hours

DMs are where Instagram converts. Someone who DMs "are you open Sunday?" is seconds away from becoming a customer — or leaving for a restaurant that replies faster.

Set Instagram notifications to on. If you can''t monitor DMs yourself, use Instagram''s auto-reply feature for common questions (hours, location, menu). A quick reply to "yes, we''re open Sunday from 5pm, here''s our menu link" closes reservations that would otherwise disappear.

## 5. Collaborate With Local Accounts

You don''t need a paid influencer. Local accounts with 2,000–10,000 engaged followers in your city consistently outperform national accounts with millions of followers, because their audience is geographically relevant to you.

**Who to approach:**
- Local food bloggers and reviewers
- Hotels and guesthouses nearby (they recommend restaurants to guests daily)
- Tourism accounts for your area
- Other non-competing local businesses

Offer a dinner for two in exchange for an honest post. Make sure it''s genuine — authenticity is obvious, and a forced review reads as one.

## Putting It Together

Post 3–4 Reels per week. Use Stories daily for real-time updates. Respond to every DM within 2 hours. Tag your location everywhere. Collaborate locally once a month.

That''s a system. And a system, repeated for 90 days, beats a single viral moment every time.',
  'Most restaurant Instagram accounts optimize for likes instead of visits. Here are five strategies that actually convert followers into customers — no paid ads or professional photographer required.',
  'Marketing',
  'system',
  '2026-05-05T09:00:00.000Z',
  '2026-05-05T09:00:00.000Z',
  '2026-05-05T09:00:00.000Z'
);

-- Post 3: Menu page design
INSERT OR IGNORE INTO platform_blog_posts (id, title, slug, body, excerpt, category, author_id, published_at, created_at, updated_at)
VALUES (
  'b1a2c3d4-e5f6-7890-abcd-ef1234567803',
  'What Makes a Restaurant Menu Page Actually Convert',
  'what-makes-a-restaurant-menu-page-convert',
  '## The Menu Page Is Where Customers Decide

Most restaurant websites treat the menu page as an afterthought — a PDF upload or a long unstyled list. But the menu page is where the decision happens. A customer who lands on your menu is one step from making a reservation or placing an order. The design and structure of that page determines whether they complete the action or leave.

Here''s what the best-performing restaurant menu pages get right.

## Clear Section Structure

Customers don''t read menus linearly — they scan. They''re looking for their category first (starters, mains, desserts, drinks), then scanning for familiar items or something that catches their eye.

**Structure your menu with:**
- Bold section headers that are immediately visible when scrolling
- Logical ordering: starters → mains → sides → desserts → drinks
- No more than 7–10 items per section (more than this creates decision fatigue)

On mobile — where 70%+ of your restaurant website traffic comes from — a long single-column menu is painful to navigate. Consider sticky section navigation that lets users jump to a category.

## Descriptions That Sell Without Being Cringe

There''s a spectrum of menu description failure: on one end, no description at all ("Pad Thai – 180 THB"). On the other, overwrought prose ("A symphony of hand-foraged ingredients, lovingly crafted by our artisanal team").

The sweet spot: a single sentence that tells the customer what''s in the dish and why it''s good. Practical, specific, honest.

**Bad:** "Our signature pasta, made with the finest ingredients"
**Good:** "Linguine with house-made crab butter, chili, and fresh basil — our most-ordered dish"

Mention the protein, the main flavour notes, and any notable technique or sourcing. That''s it.

## Prices: Show Them

Some restaurants hide prices, thinking it signals luxury. The data says otherwise. Price transparency reduces friction and builds trust. Customers who can''t quickly find a price range go elsewhere to look it up — and often don''t come back.

Show prices. If you have a tasting menu with variable pricing, show a starting price ("From 1,200 THB per person").

## At Least One Photo Per Section

You don''t need a photo of every item. But one strong, appetising photo per menu section dramatically increases time on page and reservation intent.

**What makes a good menu photo:**
- Natural light, or soft artificial light — no harsh flash
- The dish styled as it''s actually served (not a studio prop version)
- Shot from a 45° angle showing depth, not flat overhead
- No busy background — a clean table, wooden board, or slate surface

A phone camera in good light is enough. The photo doesn''t need to be professional — it needs to look like real food that a real customer is about to eat.

## Dietary Labels

Indicating which dishes are vegetarian, vegan, gluten-free, or contain common allergens (nuts, shellfish, dairy) serves two purposes: it helps customers self-select quickly, and it reduces questions your staff has to answer during service.

Simple icon labels are enough. KrabiClaw includes these as built-in fields on every menu item.

## A Clear Next Step

The menu page should end with — or have a persistent element for — a next action. Either:
- "Reserve a Table" button linking to your reservations page
- Your phone number for walk-in inquiries
- Hours and address if the customer might want to visit without a reservation

Don''t assume the customer knows what to do after reading your menu. Tell them.

## The Mobile Test

Open your menu page on your phone. Can you read the section headers without zooming? Can you tap between sections without fat-fingering the wrong one? Does it load in under 3 seconds on a mobile data connection?

If the answer to any of these is no, that''s where you start.',
  'The menu page is where customers make their decision. Most restaurant websites treat it as an afterthought — here is what the highest-converting menu pages actually do differently.',
  'Design',
  'system',
  '2026-05-01T09:00:00.000Z',
  '2026-05-01T09:00:00.000Z',
  '2026-05-01T09:00:00.000Z'
);

-- Post 4: Getting more reviews
INSERT OR IGNORE INTO platform_blog_posts (id, title, slug, body, excerpt, category, author_id, published_at, created_at, updated_at)
VALUES (
  'b1a2c3d4-e5f6-7890-abcd-ef1234567804',
  'How to Get More Google Reviews (And What to Do With Negative Ones)',
  'how-to-get-more-google-reviews',
  '## Why Reviews Are Now a Business-Critical System

Google reviews are no longer just social proof. They''re a ranking signal, a conversion driver, and increasingly the first thing a potential customer reads before visiting. Restaurants with 4.5+ stars and a consistent volume of recent reviews appear higher in local search, get more clicks, and convert browsers into bookings at a meaningfully higher rate.

This guide covers how to build a sustainable review system — and how to handle negative reviews without making them worse.

## The Review Ask: Timing Is Everything

The most common mistake: asking at the wrong moment. Asking a customer to leave a review while they''re mid-meal, or worse, while dealing with a complaint, produces either no review or a bad one.

**The right moments:**
- As the bill is settled, if the customer has expressed genuine satisfaction ("That was amazing" / "We''ll definitely be back")
- Via a follow-up WhatsApp message to repeat customers (more on this below)
- Via a QR code on the table or receipt — this gives customers time to decide, rather than feeling put on the spot

**The wrong moments:**
- During a complaint or issue
- Before the customer has finished eating
- Via a generic mass email blast

## Making the Ask Frictionless

The harder it is to leave a review, the fewer reviews you''ll get. The process should be: customer sees QR code or link → taps → lands directly on your Google review form → writes review.

To get your direct review link:
1. Go to your Google Business Profile
2. Click "Get more reviews" (or go to your profile → Share profile)
3. Copy the short link

Put this link behind a QR code (free at qr.io or similar). Print it on a small card, your receipts, or a table tent.

## The WhatsApp Follow-Up

For restaurants in Southeast Asia, WhatsApp is often more effective than email. A simple message to a regular customer — personally worded, not a template — converts at a surprisingly high rate.

**Example message:**
> "Hi [Name]! Great to see you last night. If you have a moment, we''d really appreciate a Google review — it helps a lot. Here''s the link: [link]. No pressure at all."

Key: personal, short, low-pressure, sent within 24 hours of the visit.

## Responding to All Reviews — Including Bad Ones

Responding to reviews signals to Google that your business is active, and signals to potential customers that you take feedback seriously. Businesses that respond to reviews get 12% more reviews overall, because people see their review will be acknowledged.

**For positive reviews:**
- Thank them specifically ("So glad you enjoyed the robatayaki — that''s our team''s favourite too")
- Mention something that personalises it
- Invite them back with a specific reason ("Our winter menu launches in December — hope to see you then")

**For negative reviews:**
This is where most restaurants get it wrong. The temptation is to defend or explain — resist it.

**Structure for responding to a negative review:**
1. Acknowledge ("Thank you for taking the time to share this — I''m sorry your experience wasn''t what we hoped")
2. Take responsibility without over-explaining ("That''s not the standard we hold ourselves to")
3. Offer a resolution offline ("Please reach us directly at hello@yourrestaurant.com and we''d like to make it right")
4. Keep it short — you''re writing for future customers reading this exchange, not just for the reviewer

Never argue. Never explain at length. Never blame the customer. Future customers reading your responses judge your character as much as they judge the original complaint.

## What to Do With a Fake Review

If you receive a review that you believe is fake (a competitor, a person who has never visited), you can flag it in Google Business Profile → Reviews → Flag as inappropriate. Google doesn''t remove reviews quickly or reliably, so also respond calmly as if it were real: "We don''t have any record of this visit — please reach out directly so we can look into this."

## Building Volume Over Time

A restaurant aiming for 5 new reviews per month — a modest, achievable target — will have 60 new reviews in a year. At that pace, within 18 months, your review profile will look like a thriving establishment to anyone searching Google.

The system is simple: QR code on every table, WhatsApp follow-up for regulars, respond to every review within 48 hours. Repeat.',
  'Google reviews are now a ranking signal, a conversion driver, and the first thing potential customers read. Here is how to build a review system that grows consistently — and how to handle negative reviews without making them worse.',
  'Business',
  'system',
  '2026-04-28T09:00:00.000Z',
  '2026-04-28T09:00:00.000Z',
  '2026-04-28T09:00:00.000Z'
);

-- Post 5: SEO & Analytics
INSERT OR IGNORE INTO platform_blog_posts (id, title, slug, body, excerpt, category, author_id, published_at, created_at, updated_at)
VALUES (
  'b1a2c3d4-e5f6-7890-abcd-ef1234567805',
  'Demystifying Restaurant SEO: Why You Need Search Console and Analytics Connected',
  'demystifying-restaurant-seo-search-console-analytics',
  '## The Battle for the Front Page of Google

When someone in your neighborhood searches "sushi near me" or "best Italian restaurant," a war breaks out in the search results. 

If you don''t have your SEO set up, who wins? It''s almost always the multi-billion dollar delivery giants: Grab, Foodpanda, Tripadvisor, and Yelp. They dominate the top search slots, capture the hungry customer, and then charge you a 30% commission on the order or hold your customer data hostage.

But it doesn''t have to be this way. By connecting **Google Search Console** and **Google Analytics 4 (GA4)** to your KrabiClaw storefront, you can turn your website into a direct, high-converting acquisition channel. Here is why these two tools are your secret weapons for commission-free growth.

## Why Custom Domains and Direct SEO Matter

Search engine optimization (SEO) is the difference between paying a middleman and keeping 100% of your revenue. 

When you use a third-party portal, you are renting someone else''s audience. When you build a direct web presence on your own custom domain, you are building an asset. 

KrabiClaw is designed from the ground up to rank. Every theme includes:
- **Lightning-fast edge delivery** so search engines score you highly for speed.
- **Automated JSON-LD Schema markup**, telling Google exactly what cuisine you serve, your physical coordinates, and your opening hours.
- **Dynamic XML sitemaps** that automatically update whenever you change your menu.

But to unlock the full potential of these features, you must claim ownership of your data. That''s where Search Console and Analytics come in.

## Google Search Console: The Eyes of Your Website

Think of Google Search Console (GSC) as a two-way radio between your restaurant and Google. It is a free tool that tells you exactly how the search engine sees your site.

When you connect Search Console via our [Restaurant SEO & Analytics Setup Guide](/docs/restaurant-seo-analytics-setup-guide), you gain access to vital insights:
- **Search Queries**: What exact terms did people type before clicking on your restaurant? (e.g., "outdoor dining Krabi" vs "authentic pad thai near me").
- **Indexing Status**: Are all your pages (like individual locations or special event pages) successfully indexed by Google?
- **Sitemap Submission**: You can submit your sitemap directly, telling Google to index your new dishes immediately.

Without GSC, you are flying blind. With it, you know exactly what keywords to write into your pages to attract more diners.

## Google Analytics 4: Understanding the Diner''s Journey

If Search Console tells you *how* people got to your website, Google Analytics 4 (GA4) tells you *what they did* once they arrived.

By adding your Measurement ID, GA4 begins tracking behavior:
- **Menu Visits**: Do diners spend 3 minutes looking at your menu page? If so, is your menu optimized to build trust? Refer to our guide on how to [Build a Menu Customers Can Trust](/docs/build-a-menu-customers-can-trust) to make sure your descriptions and allergen labels convert scanning into cravings.
- **Reservation Conversion**: What percentage of visitors actually click "Book a Table"? If traffic is high but bookings are low, your reservation flow might have too much friction.
- **Traffic Sources**: Are your customers coming from Instagram Reels, local blogs, or organic Google searches?

Knowing this data allows you to make smart, business-driven decisions. If Instagram is driving 80% of your bookings, you double down on video. If direct organic search dominates, you focus on local keywords.

## How to Get Started in 5 Minutes

We designed KrabiClaw to keep things simple. You don''t need to hire an expensive agency or deal with complex code.

1. **Verify Your Site**: Follow the simple steps in our [Launch Your Restaurant Website](/docs/launch-your-restaurant-website) checklist to verify your ownership in Google Search Console.
2. **Input Your Tags**: Go to your KrabiClaw Dashboard, navigate to **Site Settings**, scroll to the **SEO & Analytics** card, and input your GA4 Measurement ID and GSC verification code.
3. **Analyze & Grow**: Let the data collect for a week, then check your analytics. 

Every direct reservation is money saved from third-party commissions. Claim your front-page search listings, connect your analytics, and watch your direct bookings grow.',
  'Why do third-party delivery apps dominate restaurant search results, and how can your restaurant reclaim its organic traffic? Discover why connecting Google Search Console and Google Analytics 4 is the most critical step to driving direct, commission-free reservations.',
  'SEO',
  'system',
  '2026-05-20T10:00:00.000Z',
  '2026-05-20T10:00:00.000Z',
  '2026-05-20T10:00:00.000Z'
);

