-- Add a separate notification phone per location.
-- The public `phone` field is what customers see on the site.
-- `notification_phone` is the WhatsApp number that gets alerted on new bookings/reservations for this location.
-- Falls back to the site-level site_config.whatsapp_phone if NULL.
ALTER TABLE business_locations ADD COLUMN notification_phone TEXT;
