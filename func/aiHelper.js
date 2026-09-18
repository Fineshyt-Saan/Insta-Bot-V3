/**
 * AI Core Utility Helper (func/aiHelper.js)
 * 
 * Provides unified helper functions for prompt sanitation, token estimation,
 * provider status checks, and model fallback management.
 */

const aiCore = require("../system/ai-core.js");

function formatPrompt(prompt, options = {}) {
  if (!prompt || typeof prompt !== "string") return "";
  let clean = prompt.trim();
  if (options.maxLength && clean.length > options.maxLength) {
    clean = clean.slice(0, options.maxLength) + "...";
  }
  return clean;
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function getProviderStatus() {
  const currentProvider = aiCore.getProvider();
  const supported = aiCore.getSupportedServices();
  return {
    activeProvider: currentProvider,
    totalSupportedProviders: supported.length,
    providers: supported
  };
}

async function askAI(prompt, contextId = "default") {
  const cleanPrompt = formatPrompt(prompt);
  if (!cleanPrompt) return "⚠️ Prompt cannot be empty.";
  return await aiCore.generateCompletion({ prompt: cleanPrompt, contextId });
}

module.exports = {
  formatPrompt,
  estimateTokens,
  getProviderStatus,
  askAI
};
