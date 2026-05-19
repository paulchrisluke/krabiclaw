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

1. Open [Your Sites](/dashboard/sites).
2. Choose the restaurant site you are working on.
3. Open [Setup](/dashboard/sites/{siteId}/setup) for the guided checklist.

Replace `{siteId}` in dashboard links with the site id shown in your browser URL.

## Required Before Publishing

- Confirm the restaurant name, phone, email, and address in [Site Settings](/dashboard/sites/{siteId}/settings).
- Add the dining location in [Locations](/dashboard/sites/{siteId}/locations).
- Add core menu sections and items in [Menus](/dashboard/sites/{siteId}/menu).
- Upload real food, interior, and storefront photos in [Media](/dashboard/sites/{siteId}/media).
- Review the public pages in [Content](/dashboard/sites/{siteId}/content).

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

- Site-wide business details: [Site Settings](/dashboard/sites/{siteId}/settings)
- Physical dining locations: [Locations](/dashboard/sites/{siteId}/locations)
- Individual location edits: [Location Details](/dashboard/sites/{siteId}/locations/{locationId})
- Customer-facing pages: [Content](/dashboard/sites/{siteId}/content)

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

- Menu list and sections: [Menus](/dashboard/sites/{siteId}/menu)
- Add a dish: [New Menu Item](/dashboard/sites/{siteId}/menu/items/new)
- Edit a dish: [Menu Item Editor](/dashboard/sites/{siteId}/menu/items/{itemId})

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

- Site integrations: [Integrations](/dashboard/sites/{siteId}/integrations)
- Location-specific Google connection: [Location Details](/dashboard/sites/{siteId}/locations/{locationId})
- Reviews after sync: [Reviews](/dashboard/sites/{siteId}/reviews)
- Photos after sync: [Photos](/dashboard/sites/{siteId}/photos)

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

- ChowBot dashboard: [ChowBot](/dashboard/sites/{siteId}/chowbot)
- Owner inbox: [Inbox](/dashboard/sites/{siteId}/inbox)
- WhatsApp setup: [Integrations](/dashboard/sites/{siteId}/integrations)
- Menu review after imports: [Menus](/dashboard/sites/{siteId}/menu)
- Posts created from chat: [Posts](/dashboard/sites/{siteId}/posts)

## Good Requests

- Add these lunch specials from this photo to my menu.
- Mark the crab curry as sold out tonight.
- Draft a Songkran dinner post for this weekend.
- Update our holiday hours for May 20.
- Create three FAQ answers about parking, reservations, and vegan options.

## After ChowBot Makes Changes

Always review important operational changes in the dashboard page that owns the data:

- Menu changes in [Menus](/dashboard/sites/{siteId}/menu)
- Content changes in [Content](/dashboard/sites/{siteId}/content)
- Posts in [Posts](/dashboard/sites/{siteId}/posts)
- FAQs in [Q&A](/dashboard/sites/{siteId}/qa)

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

- Main website pages: [Content](/dashboard/sites/{siteId}/content)
- Page editor: [Pages](/dashboard/sites/{siteId}/pages)
- Restaurant updates: [Posts](/dashboard/sites/{siteId}/posts)
- Media library: [Media](/dashboard/sites/{siteId}/media)

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

- Reservation requests: [Reservations](/dashboard/sites/{siteId}/reservations)
- Customer reviews: [Reviews](/dashboard/sites/{siteId}/reviews)
- Restaurant Q&A: [Q&A](/dashboard/sites/{siteId}/qa)
- Customer messages: [Inbox](/dashboard/sites/{siteId}/inbox)

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

- Upload and manage assets: [Media](/dashboard/sites/{siteId}/media)
- Public photo gallery: [Photos](/dashboard/sites/{siteId}/photos)
- Content pages that use images: [Content](/dashboard/sites/{siteId}/content)
- Menu items that need food photos: [Menus](/dashboard/sites/{siteId}/menu)

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
