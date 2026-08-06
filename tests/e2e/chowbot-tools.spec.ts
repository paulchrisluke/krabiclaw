import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { devLoginHeaders } from "./test-env";
import { ensureSite } from "./helpers/ensure-site";
import { loginAs } from "./helpers/auth";

type RoleUser = {
  id: string;
  role: "owner" | "admin" | "editor" | "member";
};

async function execChowbotTool(
  request: APIRequestContext,
  baseURL: string,
  siteId: string,
  toolName: string,
  input: Record<string, unknown>,
  messages?: Array<{ role: "user" | "assistant"; content: string }>,
) {
  const res = await request.post(`${baseURL}/api/dev/chowbot-tool`, {
    headers: devLoginHeaders(),
    data: { siteId, toolName, input, messages },
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as { result: Record<string, unknown> };
}

test.describe("mcp tools", () => {
  test.describe.configure({ mode: "serial" });

  test("delete_post allows owner, admin, and editor through MCP tool path", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await loginAs(request, baseURL!);

    const sessionRes = await request.get(`${baseURL}/api/auth/get-session`);
    expect(sessionRes.status()).toBe(200);
    const session = (await sessionRes.json()) as { user?: { id?: string } };
    const ownerUserId = session.user?.id;
    expect(ownerUserId).toEqual(expect.any(String));

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`);
    expect(contextRes.status()).toBe(200);
    const context = (await contextRes.json()) as {
      organization?: { id?: string };
      site?: { id?: string | null };
    };
    const organizationId = context.organization?.id;
    const siteId = await ensureSite(
      request,
      baseURL!,
      context.site?.id ?? null,
    );
    expect(organizationId).toEqual(expect.any(String));

    const createUser = async (role: "admin" | "editor") => {
      const res = await request.post(`${baseURL}/api/dev/test-member`, {
        data: { role, organizationId },
        headers: devLoginHeaders(),
      });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { user: RoleUser };
      return body.user;
    };

    const admin = await createUser("admin");
    const editor = await createUser("editor");

    const createDraftPost = async (title: string) => {
      await loginAs(request, baseURL!, ownerUserId!);
      const res = await request.post(
        `${baseURL}/api/editor/sites/${siteId}/posts`,
        {
          data: { title, body: `Body for ${title}` },
        },
      );
      expect(res.status()).toBe(201);
      const body = (await res.json()) as { post?: { id?: string } };
      expect(body.post?.id).toEqual(expect.any(String));
      return body.post!.id!;
    };

    const execDeletePostTool = async (userId: string, postId: string) => {
      await loginAs(request, baseURL!, userId);
      const res = await request.post(`${baseURL}/api/dev/mcp-tool`, {
        headers: devLoginHeaders(),
        data: {
          siteId,
          toolName: "delete_post",
          input: { post_id: postId },
        },
      });
      expect(res.status()).toBe(200);
      return res.json() as Promise<{
        result: { post_id?: string; deleted?: boolean; context?: unknown };
      }>;
    };

    const ownerPostId = await createDraftPost(`Owner MCP delete ${Date.now()}`);
    const ownerDelete = await execDeletePostTool(ownerUserId!, ownerPostId);
    expect(ownerDelete.result).toEqual(
      expect.objectContaining({ post_id: ownerPostId, deleted: true }),
    );

    const adminPostId = await createDraftPost(`Admin MCP delete ${Date.now()}`);
    const adminDelete = await execDeletePostTool(admin.id, adminPostId);
    expect(adminDelete.result).toEqual(
      expect.objectContaining({ post_id: adminPostId, deleted: true }),
    );

    const editorPostId = await createDraftPost(`Editor MCP delete ${Date.now()}`);
    const editorDelete = await execDeletePostTool(editor.id, editorPostId);
    expect(editorDelete.result).toEqual(
      expect.objectContaining({ post_id: editorPostId, deleted: true }),
    );
  });

  test("update_site_settings rollback preserves original brand and subdomain through MCP tool path", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await loginAs(request, baseURL!);

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`);
    expect(contextRes.status()).toBe(200);
    const context = (await contextRes.json()) as {
      site?: { id?: string | null };
    };
    const siteId = await ensureSite(
      request,
      baseURL!,
      context.site?.id ?? null,
    );

    const beforeRes = await request.get(
      `${baseURL}/api/sites/${siteId}/settings`,
    );
    expect(beforeRes.status()).toBe(200);
    const beforeBody = (await beforeRes.json()) as {
      settings: {
        brand_name: string;
        subdomain: string;
      };
    };

    const toolRes = await request.post(`${baseURL}/api/dev/mcp-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: "update_site_settings",
        input: {
          brand_name: `${beforeBody.settings.brand_name} MCP Rollback ${Date.now()}`,
          forceSubdomainRegistrationFailure: true,
        },
      },
    });
    expect(toolRes.status()).toBe(400);
    const body = await toolRes.json();
    expect(body.data?.error).toBe("Failed to register subdomain with Cloudflare. The rename was not applied.");

    const afterRes = await request.get(
      `${baseURL}/api/sites/${siteId}/settings`,
    );
    expect(afterRes.status()).toBe(200);
    const afterBody = (await afterRes.json()) as {
      settings: {
        brand_name: string;
        subdomain: string;
      };
    };

    expect(afterBody.settings.brand_name).toBe(beforeBody.settings.brand_name);
    expect(afterBody.settings.subdomain).toBe(beforeBody.settings.subdomain);
  });

  test("location update and Q&A tools use the canonical write path end-to-end", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await loginAs(request, baseURL!);

    const siteId = await ensureSite(request, baseURL!, null);

    const listLocationsRes = await request.post(
      `${baseURL}/api/dev/mcp-tool`,
      {
        headers: devLoginHeaders(),
        data: {
          siteId,
          toolName: "list_locations",
          input: {},
        },
      },
    );
    expect(listLocationsRes.status()).toBe(200);
    const listLocationsBody = (await listLocationsRes.json()) as {
      result: { locations: Array<{ id: string; title: string }> };
    };
    expect(Array.isArray(listLocationsBody.result.locations)).toBe(true);
    expect(listLocationsBody.result.locations.length).toBeGreaterThan(0);
    const locationId = listLocationsBody.result.locations[0]!.id;

    const updateLocationRes = await request.post(
      `${baseURL}/api/dev/mcp-tool`,
      {
        headers: devLoginHeaders(),
        data: {
          siteId,
          toolName: "update_location",
          input: {
            location_id: locationId,
            title: `Updated Tool Location ${Date.now()}`,
            status: "inactive",
          },
        },
      },
    );
    expect(updateLocationRes.status()).toBe(200);
    const updateLocationBody = (await updateLocationRes.json()) as {
      result: { ok?: boolean; id?: string; error?: string };
    };
    expect(updateLocationBody.result.error).toBeUndefined();
    expect(updateLocationBody.result.ok).toBe(true);
    expect(updateLocationBody.result.id).toBe(locationId);

    const getLocationRes = await request.post(`${baseURL}/api/dev/mcp-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: "get_location",
        input: { location_id: locationId },
      },
    });
    expect(getLocationRes.status()).toBe(200);
    const getLocationBody = (await getLocationRes.json()) as {
      result: { location?: { id?: string; status?: string } };
    };
    expect(getLocationBody.result.location?.id).toBe(locationId);
    expect(getLocationBody.result.location?.status).toBe("inactive");

    const addQaRes = await request.post(`${baseURL}/api/dev/mcp-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: "create_location_qa",
        input: {
          location_id: locationId,
          question: `Do you take walk-ins? ${Date.now()}`,
          answer: "Yes",
        },
      },
    });
    expect(addQaRes.status()).toBe(200);
    const addQaBody = (await addQaRes.json()) as {
      result: { id?: string; added?: boolean; error?: string };
    };
    expect(addQaBody.result.error).toBeUndefined();
    expect(addQaBody.result.id).toEqual(expect.any(String));
    const qaId = addQaBody.result.id!;

    const deleteQaRes = await request.post(`${baseURL}/api/dev/mcp-tool`, {
      headers: devLoginHeaders(),
      data: {
        siteId,
        toolName: "delete_location_qa",
        input: {
          location_id: locationId,
          qa_id: qaId,
        },
      },
    });
    expect(deleteQaRes.status()).toBe(200);
    expect(await deleteQaRes.json()).toEqual({
      result: expect.objectContaining({
        qa_id: qaId,
        deleted: true,
      }),
    });
  });

  test("chowbot menu tools delegate to the same executor as MCP end-to-end", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await loginAs(request, baseURL!);
    const siteId = await ensureSite(request, baseURL!, null);

    const created = await execChowbotTool(request, baseURL!, siteId, "create_menu", {
      name: `Chowbot E2E Menu ${Date.now()}`,
    });
    expect(created.result.error).toBeUndefined();
    const menuId = created.result.id as string;
    expect(menuId).toEqual(expect.any(String));

    // A menu created through ChowBot's tool path must be visible through
    // MCP's — same executor, same tables, no shadow model.
    const mcpList = await request.post(`${baseURL}/api/dev/mcp-tool`, {
      headers: devLoginHeaders(),
      data: { siteId, toolName: "list_menus", input: {} },
    });
    expect(mcpList.status()).toBe(200);
    const mcpListBody = (await mcpList.json()) as {
      result: { menus: Array<{ id: string }> };
    };
    expect(mcpListBody.result.menus.some((m) => m.id === menuId)).toBe(true);

    const item = await execChowbotTool(request, baseURL!, siteId, "create_menu_item", {
      menu_id: menuId,
      section: "Starters",
      name: "Bruschetta",
      price_amount: "180",
    });
    expect(item.result.error).toBeUndefined();
    const itemId = item.result.id as string;
    expect(itemId).toEqual(expect.any(String));

    // sync_menu_items: previously ChowBot-only, now shared with MCP. Matches
    // the existing item by item_id and creates a second one in one call.
    const synced = await execChowbotTool(request, baseURL!, siteId, "sync_menu_items", {
      menu_id: menuId,
      items: [
        { item_id: itemId, price_amount: "200" },
        { section: "Starters", name: "Caprese", price_amount: "150" },
      ],
    });
    expect(synced.result.error).toBeUndefined();
    expect(synced.result.summary).toEqual(
      expect.objectContaining({ created: 1, updated: 1 }),
    );

    // Regression check: rename_menu_section previously took old_section/
    // new_section on ChowBot vs old_name/new_name on MCP. Both surfaces now
    // share one schema (old_name/new_name).
    const renamed = await execChowbotTool(request, baseURL!, siteId, "rename_menu_section", {
      menu_id: menuId,
      old_name: "Starters",
      new_name: "Antipasti",
    });
    expect(renamed.result.error).toBeUndefined();
    expect(renamed.result.updated).toBe(2);

    // Regression check: delete_menu_item's ChowBot schema declared
    // menu_item_id but the old handler read menu_id/item_id (always
    // undefined), so this tool silently no-op'd in production. Confirm it
    // actually deletes now.
    const deletedItem = await execChowbotTool(
      request,
      baseURL!,
      siteId,
      "delete_menu_item",
      { menu_item_id: itemId },
      [{ role: "user", content: "yes confirm" }],
    );
    expect(deletedItem.result.error).toBeUndefined();
    expect(deletedItem.result.deleted).toBe(true);

    // publish_menu is a ChowBot-only convenience over update_menu's status
    // field and is confirm-gated.
    const published = await execChowbotTool(
      request,
      baseURL!,
      siteId,
      "publish_menu",
      { menu_id: menuId },
      [{ role: "user", content: "yes please publish it" }],
    );
    expect(published.result.error).toBeUndefined();
    const menu = published.result.menu as { status?: string } | undefined;
    expect(menu?.status).toBe("published");

    const deletedMenu = await execChowbotTool(
      request,
      baseURL!,
      siteId,
      "delete_menu",
      { menu_id: menuId },
      [{ role: "user", content: "yes confirm" }],
    );
    expect(deletedMenu.result.error).toBeUndefined();
    expect(deletedMenu.result.deleted).toBe(true);
  });

  test("chowbot-adapter enforces per-tool minimumRole and requiredEntitlement", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await loginAs(request, baseURL!);
    const siteId = await ensureSite(request, baseURL!, null);

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`);
    expect(contextRes.status()).toBe(200);
    const context = (await contextRes.json()) as {
      organization?: { id?: string };
    };
    const organizationId = context.organization?.id;

    // Capture the owner's session before switching to the editor below —
    // loginAs swaps the request's session cookie, so get-session must run
    // while the owner is still the active session.
    const ownerSession = await request.get(`${baseURL}/api/auth/get-session`);
    const ownerUserId = ((await ownerSession.json()) as { user?: { id?: string } }).user?.id;

    const editorRes = await request.post(`${baseURL}/api/dev/test-member`, {
      data: { role: "editor", organizationId },
      headers: devLoginHeaders(),
    });
    expect(editorRes.status()).toBe(200);
    const editor = ((await editorRes.json()) as { user: RoleUser }).user;

    // reply_to_review requires MCP minimumRole 'owner' — an editor must be
    // rejected by the adapter before it ever reaches reviews.ts.
    await loginAs(request, baseURL!, editor.id);
    const editorReply = await execChowbotTool(request, baseURL!, siteId, "reply_to_review", {
      review_id: "nonexistent-review",
      reply: "Thanks!",
    });
    expect(editorReply.result.error).toContain("does not have permission");

    // create_work_request requires the managed_service entitlement on MCP —
    // a freshly created site has no such entitlement, so even the owner
    // must be rejected before create_work_request's own logic runs.
    await loginAs(request, baseURL!, ownerUserId);
    const workRequest = await execChowbotTool(request, baseURL!, siteId, "create_work_request", {
      type: "other",
      title: "Test request",
    });
    expect(workRequest.result.error).toBeTruthy();
  });

  test("chowbot translations/locales tools stay behind the conversational-surface feature flag by default", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(30_000);

    await loginAs(request, baseURL!);
    const siteId = await ensureSite(request, baseURL!, null);

    const result = await execChowbotTool(request, baseURL!, siteId, "list_locales", {});
    expect(result.result.error).toContain("not exposed on the conversational surface");
  });

  test("chowbot reviews, submissions, notifications, qa, media, and settings tools delegate to the shared executor", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await loginAs(request, baseURL!);
    const siteId = await ensureSite(request, baseURL!, null);

    const contacts = await execChowbotTool(request, baseURL!, siteId, "get_contact_inquiries", {});
    expect(contacts.result.error).toBeUndefined();
    expect(Array.isArray(contacts.result.submissions)).toBe(true);

    const notifications = await execChowbotTool(request, baseURL!, siteId, "get_notification_settings", {});
    expect(notifications.result.error).toBeUndefined();
    expect(notifications.result.notifications).toBeTruthy();

    const assets = await execChowbotTool(request, baseURL!, siteId, "get_site_media_assets", {});
    expect(assets.result.error).toBeUndefined();
    expect(Array.isArray(assets.result.assets)).toBe(true);

    const dashboardLink = await execChowbotTool(request, baseURL!, siteId, "get_dashboard_link", {
      destination: "settings.general",
    });
    expect(dashboardLink.result.error).toBeUndefined();
    expect(typeof dashboardLink.result.url).toBe("string");

    const locationsRes = await request.post(`${baseURL}/api/dev/mcp-tool`, {
      headers: devLoginHeaders(),
      data: { siteId, toolName: "list_locations", input: {} },
    });
    expect(locationsRes.status()).toBe(200);
    const locationsBody = (await locationsRes.json()) as {
      result: { locations: Array<{ id: string }> };
    };
    const locationId = locationsBody.result.locations[0]!.id;

    const qaCreated = await execChowbotTool(request, baseURL!, siteId, "create_location_qa", {
      location_id: locationId,
      question: `Do you take walk-ins? ${Date.now()}`,
      answer: "Yes",
    });
    expect(qaCreated.result.error).toBeUndefined();
    const qaId = qaCreated.result.id as string;

    const qaListed = await execChowbotTool(request, baseURL!, siteId, "list_location_qa", {
      location_id: locationId,
    });
    expect(qaListed.result.error).toBeUndefined();
    const qaItems = qaListed.result.items as Array<{ id: string }>;
    expect(qaItems.some((qa) => qa.id === qaId)).toBe(true);

    const qaDeleted = await execChowbotTool(
      request,
      baseURL!,
      siteId,
      "delete_location_qa",
      { qa_id: qaId, location_id: locationId },
      [{ role: "user", content: "yes confirm" }],
    );
    expect(qaDeleted.result.error).toBeUndefined();
    expect(qaDeleted.result.deleted).toBe(true);
  });

  test("chowbot content/hero tools delegate to the shared executor without clobbering unrelated hero fields", async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await loginAs(request, baseURL!);
    const siteId = await ensureSite(request, baseURL!, null);

    // Regression coverage for two bugs fixed together: ChowBot used to
    // maintain its own inline hero-field read-merge-write logic instead of
    // calling the shared updatePageContent/deleteContentField, and
    // deleteContentField itself never handled hero sub-fields at all (they
    // live as columns on one row keyed by field="hero", not their own row)
    // — a delete of just "hero.title" would previously silently do nothing
    // on both surfaces.
    const titleSet = await execChowbotTool(request, baseURL!, siteId, "update_page_content", {
      page: "home",
      field: "hero.title",
      value: "E2E Hero Title",
    });
    expect(titleSet.result.error).toBeUndefined();

    const subtitleSet = await execChowbotTool(request, baseURL!, siteId, "update_page_content", {
      page: "home",
      field: "hero.subtitle",
      value: "E2E Hero Subtitle",
    });
    expect(subtitleSet.result.error).toBeUndefined();

    const afterBothSet = await execChowbotTool(request, baseURL!, siteId, "get_page_fields", { page: "home" });
    const heroRowAfterSet = (afterBothSet.result.fields as Array<{ field: string; hero_title?: string; hero_subtitle?: string }>)
      .find((f) => f.field === "hero");
    expect(heroRowAfterSet?.hero_title).toBe("E2E Hero Title");
    expect(heroRowAfterSet?.hero_subtitle).toBe("E2E Hero Subtitle");

    const titleDeleted = await execChowbotTool(
      request,
      baseURL!,
      siteId,
      "delete_content_field",
      { page: "home", field: "hero.title" },
      [{ role: "user", content: "yes confirm" }],
    );
    expect(titleDeleted.result.error).toBeUndefined();
    expect(titleDeleted.result.deleted).toBe(true);

    const afterTitleDeleted = await execChowbotTool(request, baseURL!, siteId, "get_page_fields", { page: "home" });
    const heroRowAfterDelete = (afterTitleDeleted.result.fields as Array<{ field: string; hero_title?: string | null; hero_subtitle?: string }>)
      .find((f) => f.field === "hero");
    expect(heroRowAfterDelete?.hero_title).toBeFalsy();
    expect(heroRowAfterDelete?.hero_subtitle).toBe("E2E Hero Subtitle");
  });
});
