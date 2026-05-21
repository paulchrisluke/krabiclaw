-- Seed restaurant-owner documentation for KrabiClaw.
-- Run locally: yarn wrangler d1 execute REVIEWS_DB --local --file=scripts/seed-docs.sql
-- Run remotely: yarn wrangler d1 execute REVIEWS_DB --remote --file=scripts/seed-docs.sql

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-001',
  'Launch Your Restaurant Website',
  'launch-your-restaurant-website',
  '# Launch Your Restaurant Website

Use this checklist when a restaurant owner needs to get from a blank KrabiClaw account to a useful live site.

## Start Here

1. Open [Dashboard](/dashboard).
2. Use the location switcher in the dashboard header to choose the working location.
3. Open [Setup](/dashboard/setup) for the guided checklist.

## Required Before Publishing

- Confirm the restaurant name, phone, email, and address in [Settings](/dashboard/settings).
- Add the dining location in [Locations](/dashboard/locations).
- Add core menu sections and items in [Menus](/dashboard/menu).
- Upload real food, interior, and storefront photos in [Media](/dashboard/media).
- Review the public pages in [Content](/dashboard/content).

## Recommended First Pages

- Home: short positioning, best dishes, hours, and reservation link.
- Menu: complete prices and allergy notes for the dishes people ask about most.
- Location: address, parking notes, landmarks, phone, and opening hours.
- Contact: email, phone, WhatsApp if enabled, and response expectations.

## Publish Check

Open the site preview from the dashboard and check it on mobile. Most restaurant traffic comes from customers deciding quickly from a phone, so the menu, phone number, map, and hours should be easy to find without hunting.',
  'A practical restaurant launch checklist with direct links to the exact dashboard pages owners need.',
  'Getting Started',
  NULL,
  'Launch a KrabiClaw restaurant website with a direct dashboard checklist for settings, locations, menus, media, content, and publishing.',
  'restaurant website launch, restaurant dashboard checklist, KrabiClaw setup, restaurant website builder',
  'Beginner',
  1,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-002',
  'Set Up Restaurant Details',
  'set-up-restaurant-details',
  '# Set Up Restaurant Details

Your restaurant details power the public site, customer contact points, Google sync, and ChowBot answers.

## Exact Pages

- Site-wide business details: [Settings](/dashboard/settings)
- Physical dining locations: [Locations](/dashboard/locations)
- Individual location edits: [Location Details](/dashboard/locations/{locationId})
- Customer-facing pages: [Content](/dashboard/content)

## What To Add

- Official restaurant name, written exactly as customers know it.
- Phone number customers can call during service.
- Email for booking questions, catering requests, and private events.
- Street address, neighborhood, and parking or landmark notes.
- Opening hours, last order time, delivery hours, and holiday exceptions.
- Cuisine and service style, such as Thai seafood, izakaya, cafe, tasting menu, takeaway, or family dining.

## Good Restaurant Description

Write two or three sentences that answer what customers actually need to know.

Example:

Family-run Thai seafood restaurant near Ao Nang beach, serving grilled prawns, crab curry, and fresh local fish. Walk-ins are welcome for lunch, and dinner reservations are recommended for groups of six or more.

## Keep It Current

Update hours before holidays, storms, staff days, private events, and seasonal closures. If the source data is wrong, fix it in settings or the connected integration instead of hiding the problem in the frontend.',
  'Set restaurant name, contact info, hours, location details, and customer-facing description in the right dashboard pages.',
  'Getting Started',
  NULL,
  'Set up restaurant business details in KrabiClaw, including settings, locations, hours, contact information, and restaurant descriptions.',
  'restaurant details, restaurant hours, restaurant profile, KrabiClaw settings, restaurant location setup',
  'Beginner',
  2,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-003',
  'Build a Menu Customers Can Trust',
  'build-a-menu-customers-can-trust',
  '# Build a Menu Customers Can Trust

The menu is usually the page customers care about most. Treat it as operating information, not just marketing copy.

## Exact Pages

- Menu list and sections: [Menus](/dashboard/menu)
- Add a dish: [New Menu Item](/dashboard/menu/items/new)
- Edit a dish: [Menu Item Editor](/dashboard/menu/items/{itemId})

## Recommended Structure

- Starters or small plates
- Soups and salads
- Curries, noodles, grill, seafood, or cuisine-specific groups
- Vegetarian or vegan options if customers ask for them often
- Desserts
- Drinks

Keep section names plain. Customers scan faster when the words match how they order.

## Each Menu Item Should Include

- Dish name customers recognize.
- Price in the restaurant currency.
- Short description with main ingredients and cooking style.
- Spice level where relevant.
- Allergy and dietary notes when the kitchen can stand behind them.
- Real photo for best sellers and high-margin dishes.
- Availability status when an item is sold out or seasonal.

## Better Descriptions

Weak: Fresh fish with sauce.

Better: Grilled local sea bass with lime, garlic, chili, and coriander. Served whole with jasmine rice.

## Publish Safely

Before publishing, check mobile layout, spelling, prices, and whether sold-out items are hidden or marked clearly. Price mistakes create expensive conversations during service.',
  'Create menu sections and items that are accurate, scannable, and useful for restaurant customers.',
  'Menu Management',
  NULL,
  'Build a trustworthy restaurant menu in KrabiClaw with direct links to menu sections, new menu items, item editing, pricing, photos, and dietary notes.',
  'restaurant menu management, digital menu, menu item descriptions, restaurant pricing, food photos',
  'Beginner',
  3,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-004',
  'Connect Google Business Profile',
  'connect-google-business-profile',
  '# Connect Google Business Profile

Connect Google Business Profile when the restaurant already maintains hours, photos, reviews, or location data in Google.

## Exact Pages

- Location workspace: [Location Overview](/dashboard/{orgSlug}/{locationSlug})
- Location details: [Location Details](/dashboard/{orgSlug}/{locationSlug})
- Reviews after sync: [Reviews](/dashboard/{orgSlug}/{locationSlug}/reviews)
- Photos after sync: [Photos](/dashboard/{orgSlug}/{locationSlug}/photos)

## When To Connect

Connect Google when:

- The restaurant has a verified Google Business Profile.
- The owner or manager can sign in with the managing Google account.
- Google has the correct address, phone, hours, and public photos.

Fix incorrect Google data at the source first. KrabiClaw should not paper over bad profile data with frontend exceptions.

## What To Check After Sync

- Address and map pin match the real entrance.
- Phone number reaches the restaurant during service.
- Hours match dine-in, takeaway, and holiday schedules.
- Photos show current food and room setup.
- Reviews are attached to the right location.

## Restaurant Notes

For multi-location restaurants, connect each location separately. Do not reuse one Google location across several restaurant sites unless it is truly the same physical business.',
  'Connect Google Business Profile and verify synced restaurant details, photos, and reviews in the correct dashboard pages.',
  'Integrations',
  NULL,
  'Connect a restaurant Google Business Profile to KrabiClaw and verify synced address, hours, photos, and reviews.',
  'Google Business Profile restaurant, Google reviews, restaurant integrations, restaurant photos, local SEO',
  'Intermediate',
  4,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-005',
  'Use ChowBot for Restaurant Workflows',
  'use-chowbot-for-restaurant-workflows',
  '# Use ChowBot for Restaurant Workflows

ChowBot helps restaurant owners make real site updates from chat and WhatsApp. It should work from the same backend truth as the dashboard.

## Exact Pages

- Conversations: [Conversations](/dashboard/{orgSlug}/conversations)
- Owner inbox: [Inbox](/dashboard/inbox)
- WhatsApp setup: [Settings](/dashboard/{orgSlug}/~/settings/general)
- Menu review after imports: [Menus](/dashboard/menu)
- Posts created from chat: [Posts](/dashboard/posts)

## Good Requests

- Add these lunch specials from this photo to my menu.
- Mark the crab curry as sold out tonight.
- Draft a Songkran dinner post for this weekend.
- Update our holiday hours for May 20.
- Create three FAQ answers about parking, reservations, and vegan options.

## After ChowBot Makes Changes

Always review important operational changes in the dashboard page that owns the data:

- Menu changes in [Menus](/dashboard/menu)
- Content changes in [Content](/dashboard/content)
- Posts in [Posts](/dashboard/posts)
- FAQs in [Q&A](/dashboard/qa)

## WhatsApp Rule

WhatsApp is only the transport. Restaurant workflows belong to ChowBot tools, and tool results should be visible from the dashboard conversation history.',
  'Use ChowBot and WhatsApp for restaurant menu, content, post, and Q&A workflows without creating shadow histories.',
  'Advanced',
  NULL,
  'Use ChowBot for restaurant workflows in KrabiClaw, including menu imports, content updates, posts, FAQs, WhatsApp, and dashboard review.',
  'ChowBot restaurant, WhatsApp restaurant assistant, restaurant AI, menu import, restaurant content workflow',
  'Intermediate',
  5,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-006',
  'Publish Restaurant Content and Posts',
  'publish-restaurant-content-and-posts',
  '# Publish Restaurant Content and Posts

Restaurant content should help customers decide where to eat, what to order, and how to book.

## Exact Pages

- Main website pages: [Content](/dashboard/content)
- Page editor: [Pages](/dashboard/pages)
- Restaurant updates: [Posts](/dashboard/posts)
- Media library: [Media](/dashboard/media)

## What Belongs On Core Pages

- Home: signature dishes, neighborhood, hours, booking or order action.
- About: owner story, cuisine roots, chef background, sourcing, awards.
- Contact: phone, email, address, parking, accessibility, and response times.
- Location pages: neighborhood-specific directions and local landmarks.

## Useful Restaurant Posts

- New seasonal menu.
- Holiday opening hours.
- Private dining or catering availability.
- Event nights, tasting menus, guest chefs, or limited dishes.
- Delivery or takeaway changes.

## Link To Revenue Pages

When a post mentions a dish, link to the menu. When it mentions an event or busy night, link to reservations. Avoid vague advice such as "contact us for more" when a specific page exists.',
  'Create restaurant pages and posts that point customers to menus, reservations, locations, and contact details.',
  'SEO & Marketing',
  NULL,
  'Publish restaurant content and posts in KrabiClaw with links to exact pages for menus, reservations, media, and site content.',
  'restaurant content, restaurant posts, restaurant marketing, restaurant website pages, menu links',
  'Beginner',
  6,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-007',
  'Manage Reservations, Reviews, and Questions',
  'manage-reservations-reviews-and-questions',
  '# Manage Reservations, Reviews, and Questions

These pages handle high-intent customer interactions. Keep them accurate and checked during service.

## Exact Pages

- Reservation requests: [Reservations](/dashboard/reservations)
- Customer reviews: [Reviews](/dashboard/reviews)
- Restaurant Q&A: [Q&A](/dashboard/qa)
- Customer messages: [Inbox](/dashboard/inbox)

## Reservations

Check reservation requests before each service. Make sure confirmation text sets expectations for:

- Party size limits.
- Last seating time.
- Deposit or cancellation policy.
- Phone number for urgent changes.

## Reviews

Reply like a restaurant operator, not a template. Thank happy customers, name the dish or visit when possible, and move serious complaints to a direct conversation.

## Q&A

Add answers for questions staff hear every week:

- Do you take walk-ins?
- Is there parking nearby?
- Do you have vegan or gluten-free options?
- Are children welcome?
- Can you host groups or private events?

Good Q&A reduces phone interruptions during service and helps customers decide faster.',
  'Manage the restaurant pages that handle bookings, reviews, customer messages, and frequently asked questions.',
  'Getting Started',
  NULL,
  'Manage restaurant reservations, reviews, customer messages, and Q&A in KrabiClaw with exact dashboard links.',
  'restaurant reservations, restaurant reviews, restaurant Q&A, customer messages, restaurant operations',
  'Beginner',
  7,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-008',
  'Restaurant Media Checklist',
  'restaurant-media-checklist',
  '# Restaurant Media Checklist

Photos are not decoration for restaurant sites. They answer whether the food, room, and experience match what the customer wants tonight.

## Exact Pages

- Upload and manage assets: [Media](/dashboard/media)
- Public photo gallery: [Photos](/dashboard/photos)
- Content pages that use images: [Content](/dashboard/content)
- Menu items that need food photos: [Menus](/dashboard/menu)

## Minimum Photo Set

- Exterior entrance, so customers recognize the place.
- Dining room, including normal seating style.
- Five to ten best-selling dishes.
- Drinks, desserts, or set menus if they drive orders.
- Team or kitchen photo if the restaurant story matters.

## Upload Rules

- Use current photos from the real restaurant.
- Prefer natural light and clean plating.
- Avoid misleading stock images.
- Replace photos when plating, decor, or portion sizes change.
- Add menu photos to the exact dish instead of only adding them to a general gallery.

## Before Publishing

Open the public site on mobile and check that photos crop well, do not hide important text, and match the dishes currently available.',
  'A practical media checklist for restaurant owners, with links to media, photos, content, and menu pages.',
  'Theme Customization',
  NULL,
  'Restaurant media checklist for KrabiClaw covering real food photos, dining room photos, media uploads, menu images, and public gallery checks.',
  'restaurant photos, food photography, restaurant media, menu photos, restaurant website images',
  'Beginner',
  8,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-009',
  'Restaurant SEO & Analytics Setup Guide',
  'restaurant-seo-analytics-setup-guide',
  '# Restaurant SEO & Analytics Setup Guide

Search Engine Optimization (SEO) and web analytics are the difference between a beautiful restaurant website that stays quiet and a high-performance customer-acquisition engine that keeps your tables booked.

This guide provides a comprehensive overview of how KrabiClaw optimizes your search presence under the hood and how to connect industry-standard tools like Google Search Console and Google Analytics (GA4) to maximize your visibility.

---

## 1. How KrabiClaw Handles SEO Automatically

KrabiClaw is engineered from the ground up for speed, structural semantics, and maximum indexability. Out of the box, your storefront website includes:
* **Server-Side Rendering (SSR)**: Nuxt prerenders your pages so search crawlers can instantly index your menu items, dishes, prices, and locations.
* **Structured Data & Schema Markup**: We generate valid `Restaurant` and `Menu` JSON-LD schema markup. When Google indexes your site, it understands your location, currency, cuisine, and exact menu items, helping you rank for rich rich snippets (like star ratings and direct menu prices in Google search results).
* **Vite-Optimized Performance**: With a sleek, lightweight CSS theme engine, storefronts load on mobile edge networks in milliseconds, satisfying Google’s strict Core Web Vitals requirements.
* **Automatic XML Sitemaps**: Dynamic, live sitemaps are automatically compiled to tell search engines about new menu updates or blog posts instantly.

---

## 2. Setting Up Google Search Console (GSC)

Google Search Console is a free service that helps you monitor, maintain, and troubleshoot your site''s presence in Google Search results. It tells you exactly what keywords guests are searching when they discover your restaurant.

### Step 1: Add a Property in Google Search Console
1. Go to the [Google Search Console Dashboard](https://search.google.com/search-console).
2. Click **Add Property**.
3. Select **URL prefix** and enter your restaurant''s canonical web address (e.g., `https://yourrestaurant.com` or your `*.krabiclaw.com` address).
4. Click **Continue**.

### Step 2: Retrieve the HTML Tag Verification Code
1. Under **Other verification methods**, select **HTML tag**.
2. Google will display a meta tag like this:
   `<meta name="google-site-verification" content="YOUR_VERIFICATION_STRING" />`
3. Copy only the value inside the `content="..."` attribute (the `YOUR_VERIFICATION_STRING` part).

### Step 3: Enter Verification Code in KrabiClaw
1. Open your KrabiClaw Dashboard and navigate to [Settings](/dashboard/settings).
2. Scroll to the **SEO & Analytics** section.
3. Paste your code into the **Google Search Console Verification** field.
4. Click **Save Settings** in the bottom bar.
5. Go back to Google Search Console and click **Verify**.

---

## 3. Setting Up Google Analytics (GA4)

Google Analytics allows you to track website traffic, monitor guest behavior, and measure conversion events like menu clicks, calls, or reservation attempts.

### Step 1: Create a Google Analytics 4 Property
1. Go to the [Google Analytics Console](https://analytics.google.com/).
2. Create a new Account or Property for your restaurant.
3. In the Property setup, choose **Web** as the data stream platform.
4. Enter your website URL and stream name (e.g., "Main Website"), and click **Create stream**.

### Step 2: Find Your Measurement ID
1. Once the web data stream is created, locate the **Measurement ID** in the top right corner.
2. The ID always starts with **`G-`** followed by alphanumeric characters (e.g., `G-XXXXXXXXXX`). Copy this ID.

### Step 3: Connect to KrabiClaw
1. Go to your KrabiClaw Dashboard''s [Settings](/dashboard/settings).
2. Locate the **SEO & Analytics** section.
3. Paste the Measurement ID into the **Google Analytics Measurement ID** field.
4. Click **Save Settings**.
5. KrabiClaw will automatically compile the global site tag scripts and inject them dynamically in the head of your public storefront. Traffic will start registering inside Google Analytics within a few hours.

---

## 4. Operational SEO Checklist for Restaurant Owners

To get ranked ahead of third-party delivery apps and directory websites, follow these local search best practices:

* **Use a Primary Custom Domain**: Brands on custom domains (e.g., `sushibar.com`) consistently outrank generic platform subdomains. Add your domain in the [Domain Settings](/dashboard/settings) card.
* **Keep Menu Prices Accurate**: Crawlers scan prices and compare them across local index data. Having matching menu prices on your website, Google Business Profile, and third-party menus builds search trust.
* **Fill Out Business Descriptions Plainly**: Use clean, descriptive copy that states your cuisine, primary neighborhood, and location (e.g., "Family-style Italian kitchen in downtown Chiang Mai serving hand-tossed sourdough pizza and handmade pasta").
* **Publish Regular Updates**: Post weekly updates (like holiday hours, seasonal menus, or event nights) on your [Posts](/dashboard/posts) page to keep crawl patterns frequent and fresh.',
  'Optimize your restaurant''s search engine ranking and track customer traffic with Google Search Console and Google Analytics.',
  'SEO & Marketing',
  NULL,
  'Ultimate guide to restaurant SEO, Google Analytics (GA4) setup, Google Search Console verification, custom domains, and local search strategies on KrabiClaw.',
  'restaurant seo, google analytics restaurant, search console restaurant, local seo, restaurant marketing, rich snippets, schema markup',
  'Intermediate',
  9,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-010',
  'Managing Your Subscription, Invoices, and Credit Balance',
  'manage-subscription-invoices-billing-portal',
  '# Managing Your Subscription, Invoices, and Credit Balance

KrabiClaw utilizes a secure self-service billing system powered by Stripe. You have complete control over your subscription plans, PDF tax invoices, and AI credit balances directly from your dashboard.

---

## 1. Accessing Your Billing Settings

To manage your billing, plans, or check your credit balance:
1. Open your [Dashboard](/dashboard).
2. Navigate to **Billing** under the main menu sidebar or open [Billing Settings](/dashboard/billing) directly.
3. Only organization owners have permission to access billing dashboards. If you receive an access error, confirm your membership role is set to Owner.

---

## 2. Secure self-service Stripe Customer Portal

For high-security operations, KrabiClaw routes you to a secure Stripe-hosted Billing Portal. From this portal, you can:
* **Download PDF Invoices**: Obtain official tax invoices and receipts for past subscription cycles.
* **Update Payment Methods**: Add new credit or debit cards, remove expired cards, or set a primary payment source.
* **Change Plans**: Switch between Pro and Enterprise tiers, or upgrade from the Free tier instantly.
* **Cancel Subscription**: Downgrade back to the Free plan. Downgrades take effect at the end of your current billing period.

To launch the portal, click the **Manage Subscription** button on the [Billing Dashboard](/dashboard/billing).

---

## 3. Purchasing AI Credit Top-Ups

Your monthly AI credit allowance (500 for Free, 5,000 for Pro, 50,000 for Enterprise) powers automated workflows like photo menu extraction and natural language copywriting with ChowBot. 

If you exhaust your monthly credit balance before the next billing cycle:
* **No Site Disruptions**: Your website remains fully online and functional. Only new AI requests will return a "credits exhausted" alert.
* **Flexibility**: You can buy one-time credit top-up packages directly from your [Billing Settings](/dashboard/billing) page.
* **Top-Up Bundles**: Available in packs of 500, 2,500, or 5,000 credits.
* **No Expiry**: Purchased top-up credits never expire and roll over indefinitely.

---

## 4. Refund Guarantee

We stand behind our product. KrabiClaw offers a **30-day money-back guarantee** on all paid plans. If you are not satisfied with the platform for any reason, email hello@krabiclaw.com within 30 days of your first payment for a full refund.',
  'Learn how to manage your subscription plan, download PDF tax invoices, update credit cards, and buy AI credits through the Stripe Customer Portal.',
  'Getting Started',
  NULL,
  'Self-service guide to managing your KrabiClaw billing, Stripe Customer Portal, PDF tax invoices, payment updates, and AI credit packages.',
  'restaurant billing, stripe customer portal, download invoice restaurant, update credit card, purchase ai credits, krabiclaw subscription',
  'Beginner',
  10,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-011',
  'Multi-Location Restaurant Billing and Proration Explained',
  'multi-location-restaurant-billing-proration',
  '# Multi-Location Restaurant Billing and Proration Explained

KrabiClaw is built specifically to support multi-location restaurant brands. Our Pro plan scales dynamically with your physical presence, ensuring you only pay for what you actually use.

---

## 1. Per-Location Pricing Model

On KrabiClaw, pricing scales on a **per-location** basis:
* **The Shared Workspace is Free**: Your website design, global digital menus, domain settings, and dashboard user accounts are shared across your entire brand workspace at no extra cost.
* **Per-Location Billing**: You only pay for active physical dining rooms. If you run one restaurant location, your Pro plan is $29/month. If you open a second dining room, the system scales to $58/month.

---

## 2. Dynamic Stripe Subscription Quantity Sync

To make adding or removing locations frictionless, KrabiClaw automatically handles Stripe quantity mapping under the hood:
1. **Adding a Location**: When you add a new business location from the [Locations Dashboard](/dashboard/locations), KrabiClaw immediately queries your active location count.
2. **Stripe Quantity Match**: The platform immediately sends a webhook to Stripe, updating your subscription item quantity to match the new location count.
3. **Automatic Proration**: Stripe automatically calculates the prorated difference. You will only pay the partial-month price for the new location for the remainder of your billing cycle.
4. **Removing a Location**: If you deactivate or delete a location, the quantity on Stripe immediately adjusts downward. The lower pricing takes effect on your next monthly invoice.

---

## 3. Managing Inactive Locations

If you have a location that operates seasonally (e.g., closed for winter) or is undergoing temporary renovations, you do not need to delete it and lose your custom data:
* **Deactivate Status**: Toggle the location status to **Inactive** in [Location Settings](/dashboard/locations/{locationId}).
* **Billing Impact**: Inactive locations do not count toward your active billing quantity. KrabiClaw will automatically reduce your Stripe quantity at the end of the current period, saving you money while preserving your setup.',
  'Understand how our dynamic per-location billing model works, how Stripe prorations are calculated when adding locations, and how to manage seasonal closures.',
  'Advanced',
  NULL,
  'Multi-location restaurant billing, Stripe proration explanation, adding locations, managing seasonal restaurant status, and Pro plan scaling rules.',
  'multi location billing, restaurant billing proration, stripe proration restaurant, seasonal location closing, krabiclaw pro plan',
  'Intermediate',
  11,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);
