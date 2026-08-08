import { Router, Response, Request } from "express";
import prisma from "../lib/prisma";

const router = Router();

const SITE = process.env.PUBLIC_SITE_URL || "https://rankarenas.com";

// Static routes a crawler should always know about, with how often they change.
const STATIC_ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/community", changefreq: "daily", priority: "0.9" },
  { path: "/leaderboard", changefreq: "daily", priority: "0.7" },
  { path: "/register", changefreq: "monthly", priority: "0.8" },
  { path: "/login", changefreq: "monthly", priority: "0.5" },
];

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sitemap generated on request so newly published community articles — the
 * only public content that grows — are discoverable without a redeploy.
 * The static file this replaces listed five fixed URLs and nothing else.
 */
router.get("/sitemap.xml", async (_req: Request, res: Response) => {
  const articles = await prisma.article.findMany({
    select: { id: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 5000, // sitemap limit is 50k URLs; well clear of it
  });

  const urls = [
    ...STATIC_ROUTES.map(
      (r) =>
        `  <url>\n    <loc>${SITE}${r.path}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`
    ),
    ...articles.map(
      (a) =>
        `  <url>\n    <loc>${xmlEscape(`${SITE}/community/${a.id}`)}</loc>\n    <lastmod>${a.updatedAt.toISOString()}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
    ),
  ];

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // Crawlers re-fetch often; an hour of caching keeps the query rate sane.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
  );
});

export default router;
