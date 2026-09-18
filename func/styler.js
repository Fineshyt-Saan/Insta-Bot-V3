/**
 * Styler and Message Typography Layout Engine
 * Provides styled messaging, borders, headers, and footer components.
 */

const { applyFont, autoBold, reverseFonts, fontMap, fonts } = require("./fonts.js");

/**
 * Format a complete response object into styled text
 * @param {Object|string} options - formatting options or raw string
 * @param {Object} defaultCfg - fallback configuration
 */
function format(options, defaultCfg = {}) {
  if (typeof options === "string") {
    return autoBold(options);
  }
  if (!options || typeof options !== "object") {
    return String(options || "");
  }

  const titleRaw = typeof options.title === "object" ? options.title?.content : options.title;
  const contentRaw = typeof options.content === "object" ? options.content?.content : options.content;
  const footerRaw = typeof options.footer === "object" ? options.footer?.content : options.footer;

  const titleFont = options.titleFont || options.title?.text_font || defaultCfg.titleFont || "bold";
  const contentFont = options.contentFont || options.content?.text_font || defaultCfg.contentFont || "none";
  const footerFont = options.footerFont || options.footer?.text_font || "fancy";

  const parts = [];

  // Title section
  if (titleRaw) {
    const styledTitle = applyFont(String(titleRaw), titleFont);
    parts.push(styledTitle);
  }

  // Content section
  if (contentRaw !== undefined && contentRaw !== null) {
    let styledContent = String(contentRaw);
    if (contentFont && contentFont !== "none") {
      styledContent = applyFont(styledContent, contentFont);
    }
    styledContent = autoBold(styledContent);
    parts.push(styledContent);
  }

  // Footer section
  if (footerRaw) {
    const styledFooter = applyFont(autoBold(String(footerRaw)), footerFont);
    parts.push(styledFooter);
  }

  return parts.join("\n\n");
}

module.exports = {
  format,
  autoBold,
  applyFont,
  applyFonts: applyFont,
  reverseFonts,
  fonts
};
