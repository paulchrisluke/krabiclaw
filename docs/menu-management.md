# Menu Management

Learn how to manage your restaurant menu in KrabiClaw.

## Create a Menu

1. Navigate to the Menu section
2. Click "Create Menu"
3. Enter menu name (e.g., "Lunch Menu", "Dinner Menu")
4. Add a description (optional)
5. Save

## Add Menu Items

1. Open your menu
2. Click "Add Item"
3. Enter item name
4. Add description
5. Set price
6. Upload photo (optional)
7. Choose category (optional; create categories as needed, see Organize Categories below)
8. Save

## Organize Categories

Categories help organize your menu items. Common categories:
- Appetizers
- Main Courses
- Desserts
- Beverages
- Specials

### Create a New Category

1. Navigate to the Menu section
2. Click "Categories" or "Manage Categories"
3. Click "Add Category"
4. Enter category name (required)
5. Add description (optional)
6. Click "Save"

### Edit or Delete a Category

1. Navigate to Categories
2. Select the category you want to modify
3. Click "Edit" to update name/description, then save
4. Click "Delete" to remove the category (requires confirmation)
5. Note: Deleting a category removes the category assignment only. Items remain in your menu as uncategorized items (not moved to a default category), and they stay editable/searchable in the admin. Follow up by reassigning them from the item editor (or by bulk-editing section/category where available). Example: if "Desserts" is deleted, "Mochi" stays in the menu but appears uncategorized until you assign it to "Sweets".

### Reorder Categories

1. Open the Categories manager
2. Use drag-and-drop to reorder categories, or
3. Use "Move Up" / "Move Down" controls next to each category
4. Click "Save Changes" to apply the new order

## Import from PDF/Photo

Use our AI-powered menu import to automatically extract menu items from:
- PDF menus
- Photos of menus
- Text files

### How to Import

1. Navigate to the Menu section
2. Click "Import" on the menu list or select "Import from PDF/Photo"
3. Upload your file using one of these methods:
   - Drag and drop the file into the upload area
   - Click "Select File" to browse your computer
4. Supported formats: PDF, PNG, JPG, JPEG, TXT (max 10MB)
5. Wait for processing (typically 10-30 seconds depending on file size)

### After Import

1. AI extracts menu items into a draft list
2. Review each imported item:
   - Check item name for OCR errors
   - Verify price accuracy
   - Add or correct description
   - Assign to appropriate category
3. Click "Save" to add items to your menu, or "Discard" to cancel

### Tips for Best Results

- Use high-resolution, clear photos
- Single-column PDFs work best
- Ensure good lighting for photos
- Avoid handwritten menus when possible
- Check for duplicate items after import

### Re-importing

If the import didn't capture items correctly:
1. Discard the current import
2. Try a different file format (e.g., PDF instead of photo)
3. Ensure the original menu is clear and legible
4. Re-upload and process again

## Publish Your Menu

1. Review your menu
2. Click "Publish"
3. Your menu is now live on your website

## Tips

- Keep descriptions short and appetizing
- Use high-quality photos
- Update prices regularly
- Mark items as unavailable when out of stock

### Mark items as unavailable

See Add Menu Items above for the item-edit flow and Tips for stock hygiene.

1. Open Menu, then click the item to edit.
2. Toggle Available for ordering off (this updates the `available` field to `false`).
3. Save changes.

API/admin details:
- Admin handler uses `updateMenuItem` in server logic.
- Endpoint: `PATCH /api/editor/sites/:siteId/menus/:menuId/items/:itemId` with payload like `{ "available": false }`.

Behavior and common workflows:
- Temporarily out of stock: set `available` to `false`; item remains in admin lists for quick re-enable later.
- Permanently discontinued: set `available` to `false` first (so it disappears from customer ordering views), then optionally delete after internal review/history checks.
