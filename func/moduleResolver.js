/**
 * Universal Module Resolver and Transpilation Engine
 * Provides path alias resolution and dynamic TypeScript/ESM require hooks.
 * Powered by Floppa Engine.
 */

const path = require("path");
let fs;
try {
  fs = require("fs-extra");
} catch (_) {
  fs = require("fs");
}
const Module = require("module");

let sucrase = null;
try {
  sucrase = require("sucrase");
} catch (e) {
  // Loaded once available
}

// Ensure baseline global context is always defined for imported modules
if (!global.FloppaBot) {
  global.FloppaBot = {
    commands: new Map(),
    eventCommands: new Map(),
    aliases: new Map(),
    onChat: [],
    onEvent: [],
    onReply: new Map(),
    onReaction: new Map(),
    config: {},
    configCommands: {},
    invLimit: 120,
    highRoll: Math.floor(Number.MAX_SAFE_INTEGER),
    presets: new Map(),
    plugins: {}
  };
}
if (!global.GoatBot) global.GoatBot = global.FloppaBot;
if (!global.Cassidy) global.Cassidy = global.FloppaBot;
if (!global.utils) {
  try {
    global.utils = require("../utils.js");
  } catch (_) {
    global.utils = {};
  }
}

// Map of alias prefixes to target directories/files
const ALIASES = {
  "@cass/define": path.join(__dirname, "definers.js"),
  "@cassidy/styler": path.join(__dirname, "styler.js"),
  "@cass/unispectra": path.join(__dirname, "unisym.js"),
  "@cassidy/unispectra": path.join(__dirname, "unisym.js"),
  "@cass/spectral-home": path.join(__dirname, "modules/spectralCMDHome.ts"),
  "@cassidy/spectral-home": path.join(__dirname, "modules/spectralCMDHome.ts"),
  "@cass/redux-home": path.join(__dirname, "modules/reduxCMDHomeV2.ts"),
  "@cassidy/redux-home": path.join(__dirname, "modules/reduxCMDHomeV2.ts"),
  "@cass/plugin-order": path.join(__dirname, "plugins/pluginOrder.js"),
  "@cass-modules": path.join(__dirname, "modules"),
  "@cass-plugins": path.join(__dirname, "plugins"),
  "@cass-commands": path.join(__dirname, "../scripts/cmds"),
  "cassidy-styler": path.join(__dirname, "styler.js"),
  "output-cassidy": path.join(__dirname, "outputClass.js"),
  "fca-liane-utils": path.join(__dirname, "fcaLianeUtils.js"),
  "@cassidy/ut-shop": path.join(__dirname, "plugins/ut-shop.js"),
  "@defs": path.join(__dirname, "definers.js"),
  "@root": path.join(__dirname, ".."),
  "uuid/v4": path.join(__dirname, "uuidV4Shim.js"),
  "@napi-rs/canvas": path.join(__dirname, "napiCanvasShim.js"),
  "canvas": path.join(__dirname, "napiCanvasShim.js"),
  "bcrypt": path.join(__dirname, "bcryptShim.js"),
  "bcryptjs": path.join(__dirname, "bcryptShim.js")
};

// Hook into Module._resolveFilename for alias interception
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (request === alias) {
      if (fs.existsSync(target)) return target;
      for (const ext of [".js", ".ts", ".tsx", ".json", "/index.js", "/index.ts"]) {
        if (fs.existsSync(target + ext)) return target + ext;
      }
      return originalResolveFilename.call(this, target, parent, isMain, options);
    }
    if (request.startsWith(alias + "/")) {
      const subPath = request.slice(alias.length + 1);
      let resolved = path.join(target, subPath);

      if (fs.existsSync(resolved)) return resolved;
      const extensions = [".js", ".ts", ".tsx", ".json", "/index.js", "/index.ts"];
      for (const ext of extensions) {
        if (fs.existsSync(resolved + ext)) {
          return resolved + ext;
        }
      }
      return originalResolveFilename.call(this, resolved, parent, isMain, options);
    }
  }

  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      const baseName = path.basename(request);
      const searchDirs = [
        path.join(__dirname, "modules"),
        path.join(__dirname, "plugins"),
        path.join(__dirname, "../scripts/plugins"),
        path.join(__dirname, "../scripts/cmds"),
        path.join(__dirname, "../handlers/modules"),
        __dirname
      ];
      const extensions = ["", ".js", ".ts", ".tsx", ".json", "/index.js", "/index.ts"];
      for (const dir of searchDirs) {
        for (const ext of extensions) {
          const testPath = path.join(dir, baseName + ext);
          if (fs.existsSync(testPath)) {
            try {
              if (fs.statSync(testPath).isFile()) {
                return testPath;
              }
            } catch (_) {}
          }
        }
      }
    }
    throw err;
  }
};

// Simple regex fallback transpiler
function fallbackTranspile(code) {
  return code
    .replace(/import\s+(?:(?:\*\s+as\s+([A-Za-z0-9_$]+)|([A-Za-z0-9_$]+)(?:,\s*\{([^}]+)\})?|\{([^}]+)\}))\s+from\s+['"]([^'"]+)['"];?/g, 
      (match, star, def, named1, named2, pkg) => {
        let res = "";
        if (def) res += `const ${def} = require('${pkg}').default || require('${pkg}');\n`;
        if (star) res += `const ${star} = require('${pkg}');\n`;
        const named = named1 || named2;
        if (named) res += `const { ${named} } = require('${pkg}');\n`;
        return res;
      })
    .replace(/import\s+['"]([^'"]+)['"];?/g, "require('$1');")
    .replace(/export\s+default\s+/g, "module.exports = ")
    .replace(/export\s+const\s+([A-Za-z0-9_$]+)\s*=/g, "exports.$1 =")
    .replace(/export\s+let\s+([A-Za-z0-9_$]+)\s*=/g, "exports.$1 =")
    .replace(/export\s+function\s+([A-Za-z0-9_$]+)/g, "exports.$1 = function $1")
    .replace(/export\s+async\s+function\s+([A-Za-z0-9_$]+)/g, "exports.$1 = async function $1")
    .replace(/export\s+class\s+([A-Za-z0-9_$]+)/g, "exports.$1 = class $1")
    .replace(/:\s*[A-Za-z0-9_<>[\]|&?,\s]+(?=[=,);{])/g, "");
}

// Hook into require.extensions
function registerExtension(ext, transforms) {
  require.extensions[ext] = function (module, filename) {
    const rawContent = fs.readFileSync(filename, "utf8");
    let compiled = "";

    try {
      if (!sucrase) {
        try { sucrase = require("sucrase"); } catch (e) {}
      }

      if (sucrase) {
        compiled = sucrase.transform(rawContent, {
          transforms,
          disableESTransforms: true,
          filePath: filename
        }).code;
      } else {
        compiled = fallbackTranspile(rawContent);
      }
    } catch (err) {
      compiled = fallbackTranspile(rawContent);
    }

    module._compile(compiled, filename);
  };
}

registerExtension(".ts", ["typescript", "imports"]);
registerExtension(".tsx", ["typescript", "jsx", "imports"]);
registerExtension(".jsx", ["jsx", "imports"]);

// Also intercept ESM .js files
const originalJsExtension = require.extensions[".js"];
require.extensions[".js"] = function (module, filename) {
  if (filename.includes("node_modules")) {
    return originalJsExtension(module, filename);
  }
  const rawContent = fs.readFileSync(filename, "utf8");
  if (rawContent.includes("import ") || rawContent.includes("export ") || rawContent.includes("export default")) {
    let compiled = "";
    try {
      if (!sucrase) {
        try { sucrase = require("sucrase"); } catch (e) {}
      }
      if (sucrase) {
        compiled = sucrase.transform(rawContent, {
          transforms: ["imports", "jsx"],
          disableESTransforms: true,
          filePath: filename
        }).code;
      } else {
        compiled = fallbackTranspile(rawContent);
      }
    } catch (e) {
      compiled = fallbackTranspile(rawContent);
    }
    return module._compile(compiled, filename);
  }
  return originalJsExtension(module, filename);
};

module.exports = {
  ALIASES,
  registerExtension
};
