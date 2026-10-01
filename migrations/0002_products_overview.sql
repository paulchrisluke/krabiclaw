-- Owner-approved Products overview. Only Krabiclaw's page document changes.
-- Static brand assets travel with the Worker; no remote upload or preview flag.
-- Retain the Features document identity, and its existing share/index relationships.
UPDATE content_documents SET path = '/products' WHERE organization_id = 'platform' AND kind = 'page' AND path = '/features';
--> statement-breakpoint
INSERT INTO content_documents (id,organization_id,kind,row_role,locale,path,title,summary,source,metadata_json)
SELECT 'platform-products','platform','page','root','en','/products','Products','Build your website, manage everyday updates with ChatGPT and Claude, and bring enquiries, bookings, content, reviews and analytics together.','pages','{}'
WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform') AND NOT EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
UPDATE content_documents SET title = 'Products', summary = 'Build your website, manage everyday updates with ChatGPT and Claude, and bring enquiries, bookings, content, reviews and analytics together.', metadata_json = json_set(metadata_json,'$.page_type','custom','$.recipe','products'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
DELETE FROM media_placements WHERE organization_id = 'platform' AND owner_type = 'content_block' AND owner_id IN (SELECT id FROM content_blocks WHERE document_id = (SELECT id FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products'));
--> statement-breakpoint
DELETE FROM content_blocks WHERE document_id = (SELECT id FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-coast.png','platform','image','static','external','/images/products/coast.png','coast.png','image/png',2577930,1672,941,'Coastal Krabi landscape with a warmly lit building','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-ncls.jpg','platform','image','static','external','/images/products/ncls.jpg','ncls.jpg','image/jpeg',378473,2048,1466,'North Carolina Legal Services website with its access to justice headline','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-kikuzuki.png','platform','image','static','external','/images/products/kikuzuki.png','kikuzuki.png','image/png',1856298,2048,1340,'Kikuzuki website featuring its Japanese dining photography','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-pottery-phone.png','platform','image','static','external','/images/products/pottery-phone.png','pottery-phone.png','image/png',1219771,946,1884,'Pottery House Krabi website with a guest booking link','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-inbox-art.png','platform','image','static','external','/images/products/inbox-art.png','inbox-art.png','image/png',2150721,1536,1024,'Ivory paper envelopes, a coral paper bird and indigo leaves','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-kikuzuki-people.jpg','platform','image','static','external','/images/products/kikuzuki-people.jpg','kikuzuki-people.jpg','image/jpeg',52780,540,406,'People, food and shared moments at Kikuzuki','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-line3-order1.webp','platform','image','static','external','/images/products/line3-order1.webp','line3-order1.webp','image/webp',124280,1200,900,'A real published restaurant social post with food photographs','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO media_assets (id,organization_id,kind,provider,source,public_url,file_name,mime_type,file_size,width,height,alt_text,status)
SELECT 'products-asset-line3-order2.webp','platform','image','static','external','/images/products/line3-order2.webp','line3-order2.webp','image/webp',47914,900,1200,'A Pottery House Krabi social video showing clay being shaped by hand','active' WHERE EXISTS (SELECT 1 FROM organization WHERE id = 'platform');
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-hero',id,'hero',0,'{"title":"Your website is\njust the beginning.","subtitle":"Build your online home. Keep it current.\nStay close to your customers.","cta_label":"Start free","cta_url":"/signup"}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-hero-media','platform','content_block','products-hero','media','products-asset-coast.png' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-navigation',id,'button_group',1,'{"buttons":[{"label":"Build","url":"/products#products-website-builder"},{"label":"Manage","url":"/products#products-management"},{"label":"Connect","url":"/products#products-inbox"},{"label":"Grow","url":"/products#products-content-social"}]}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-website-builder',id,'media_text',2,'{"example_type":"websites","eyebrow":"Website builder","title":"Make it\nyours.","body":"An online home with room for your business. Bring your story, services and experiences together in a website that feels like you.","label":"Explore website builder","url":"/templates","caption":"Real businesses. Their own point of view.","items":[{"title":"NCLS"},{"title":"Kikuzuki"},{"title":"Pottery House Krabi"}]}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-website-builder-items.0.image','platform','content_block','products-website-builder','items.0.image','products-asset-ncls.jpg' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-website-builder-items.1.image','platform','content_block','products-website-builder','items.1.image','products-asset-kikuzuki.png' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-website-builder-items.2.image','platform','content_block','products-website-builder','items.2.image','products-asset-pottery-phone.png' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-management',id,'workflow_grid',3,'{"label":"AI website management","title":"Say it.\nChange it.","description":"Manage your website with ChatGPT, Claude and MCP. Make everyday updates in plain language.","prompt_heading":"What would you like to do?","cta_label":"Explore AI management","cta_url":"/docs/mcp-setup","items":[{"title":"Describe the change","prompt":"Refresh the menu.","description":"Describe the update you want."},{"title":"Review the details","prompt":"Update opening hours.","description":"Check the details before you make the change."},{"title":"Make it happen","prompt":"Draft something new.","description":"Use connected tools to make your update."}]}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-inbox',id,'media_text',4,'{"eyebrow":"Inbox & messaging","title":"Keep the\nconversation\ngoing.","body":"Customer questions deserve a clear next step. Bring your website enquiries together, so you can see what needs a reply.","label":"Explore inbox & messaging","url":"/docs","caption":"Good business starts with a conversation.","items":[{"title":"Paper envelopes with a coral bird and indigo leaves"}]}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-inbox-items.0.image','platform','content_block','products-inbox','items.0.image','products-asset-inbox-art.png' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-bookings',id,'media_text',5,'{"eyebrow":"Bookings & reservations","title":"Turn a little\ninterest into\n“see you soon.”","body":"Make it easier for people to take the next step. Offer table reservations and bookable experiences from your website.","label":"Explore bookings","url":"/experiences","caption":"Made for real-world moments.\nPottery House Krabi’s customer-facing website.\nReal people, real experiences, one clear next step.","items":[{"title":"Pottery House Krabi"}]}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-bookings-items.0.image','platform','content_block','products-bookings','items.0.image','products-asset-pottery-phone.png' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-content-social',id,'media_text',6,'{"example_type":"posts","eyebrow":"Content & social","title":"Show what’s\nhappening.","body":"Your business has a story worth sharing. Give your latest photos, stories and announcements a place to live.","label":"Explore content & social","url":"/posts","caption":"The people and moments behind Kikuzuki","items":[{"title":"Kikuzuki"},{"title":"A published restaurant post"},{"title":"Pottery House Krabi"}]}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-content-social-items.0.image','platform','content_block','products-content-social','items.0.image','products-asset-kikuzuki-people.jpg' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-content-social-items.1.image','platform','content_block','products-content-social','items.1.image','products-asset-line3-order1.webp' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-content-social-items.2.image','platform','content_block','products-content-social','items.2.image','products-asset-line3-order2.webp' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-insight',id,'feature_grid',7,'{"source":"manual","title":"A little more insight. A stronger local presence.","items":[{"title":"Be part of the\nlocal conversation.","description":"Bring reviews and useful business information into view.","label":"Explore reviews & local presence","url":"/docs"},{"title":"Know where\nto look next.","description":"See how people find and use your website. Make your next decision with a clearer picture.","label":"Explore analytics","url":"/docs"}]}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO content_blocks (id,document_id,type,position,data_json)
SELECT 'products-closing',id,'cta',8,'{"title":"Make your next move.","description":"Your business. Your people. Your online home.","label":"Start free","url":"/signup"}' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-closing-media','platform','content_block','products-closing','media','products-asset-coast.png' WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
--> statement-breakpoint
-- A stale generated Features card must not describe Products. Use the authored cover
-- until the existing social-card generator renders this document's next card.
DELETE FROM media_placements WHERE organization_id='platform' AND owner_type='content_document' AND owner_id=(SELECT id FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products') AND slot IN ('cover','social_card');
--> statement-breakpoint
INSERT INTO media_placements (id,organization_id,owner_type,owner_id,slot,asset_id)
SELECT 'products-cover','platform','content_document',id,'cover','products-asset-coast.png' FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products';
--> statement-breakpoint
INSERT INTO public_resource_cache_invalidations (id,organization_id,reason,status,attempt_count)
SELECT 'products-overview-content','platform','products-overview','pending',0 WHERE EXISTS (SELECT 1 FROM content_documents WHERE organization_id = 'platform' AND kind = 'page' AND row_role = 'root' AND locale = 'en' AND path = '/products');
