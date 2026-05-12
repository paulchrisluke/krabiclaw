# Theme Customization

Customize the look and feel of your restaurant website.

## Colors

KrabiClaw uses a brand color system. You can customize:
- Primary color
- Secondary color
- Accent color
- Background colors
- Text colors

### How to Customize Colors

Colors can be customized via the **Theme Settings** in your dashboard:

1. Navigate to **Settings → Theme**
2. Under "Colors", click on a color swatch to open the color picker
3. Select your custom color or enter a hex code (e.g., #FF5733)
4. Click "Save Changes" to apply

**Example configuration:**
```yaml
# theme.config.yml
colors:
  primary: "#E87F67"      # Your brand color
  secondary: "#2BB5B5"    # Complementary color
  accent: "#FB7461"       # Call-to-action color
  background: "#F8F6F3"    # Page background
  text: "#1F2547"          # Main text color
```

## Fonts

Choose from our curated font pairs:
- Modern sans-serif
- Classic serif
- Playful display
- Professional

### How to Change Fonts

1. Go to **Settings → Theme → Fonts**
2. Select a font pair from the dropdown
3. Preview changes in real-time
4. Click "Save" to apply

**Example:**
```yaml
# theme.config.yml
fonts:
  heading: "Fredoka"        # Display font
  body: "Poppins"          # Body text
  menu: "Instrument Serif" # Menu items
```

## Layout Options

- Single column
- Two column
- Grid layout
- Card-based

### How to Change Layout

1. Navigate to **Settings → Theme → Layout**
2. Select your preferred layout style
3. Adjust spacing and width settings
4. Save to apply changes

**Example:**
```yaml
# theme.config.yml
layout:
  style: "grid"           # single, two-column, grid, card
  max_width: "1200px"      # Content width
  spacing: "medium"        # tight, medium, loose
```

## Sections

Enable/disable sections:
- Hero banner
- Menu section
- Photo gallery
- Reviews
- Contact form
- Reservations
- About section

### How to Manage Sections

1. Go to **Settings → Theme → Sections**
2. Toggle sections on/off using the switches
3. Drag to reorder sections
4. Click "Save" to apply

**Example:**
```yaml
# theme.config.yml
sections:
  hero: true
  menu: true
  gallery: false
  reviews: true
  contact: true
  reservations: true
  about: false
```

## Mobile Optimization

All themes are mobile-responsive. Preview your site on different devices to ensure it looks great everywhere.

### Mobile Preview

1. Click the "Mobile Preview" button in the theme editor
2. Toggle between phone and tablet views
3. Adjust mobile-specific settings if needed

## Best Practices

- Use high-contrast colors for readability
- Keep font sizes readable (minimum 16px)
- Test on mobile devices
- Maintain consistent spacing

## Related Documentation

- [Getting Started](./getting-started.md)
- [Menu Management](./menu-management.md)
