"use strict";

/**
 * English UI strings for InstaBOT.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

module.exports = {
	// dispatcher
	commandNotFound: "Command not found! Try {pn}help",
	commandNotFoundSuggestion: "Command not found! Did you mean {pn}%1 or try {pn}help",
	onlyAdmin: "Only group admins can use: %1",
	onlyAdminBot: "Only bot admins can use: %1",
	cooldown: "Please wait %1s before using %2 again.",
	userBanned: "You are banned from using %1. Reason: %2",
	notWhitelisted: "You are not allowed to use %1.",
	errorOccurred: "An error occurred in %1:\n%2",
	onReplyFindCommandName: "This reply is not linked to a command.",
	onReplyCommandNotFound: "Command %1 no longer exists.",

	// events
	welcomeThread: "Thanks for adding me to \"%1\"!",
	leftThread: "Bot removed from \"%1\".",
	adminAdded: "%1 is now an admin.",

	// startup
	onlineAgain: "%1 is online again.",

	// commands
	pingProcessing: "Pinging...",
	pingResult: "Pong! %1ms",
	helpTitle: "── %1 COMMANDS ──",
	helpFooter: "Use %1help <command> for details.",
	helpCommandTitle: "── %1 ──",
	helpNotFound: "No command named \"%1\".",
	helpUsage: "Usage: %1",
	helpRole: "Role: %1",
	helpDescription: "Description: %1",
	helpCategory: "Category: %1",
	uidYourID: "%1",
	uidThreadID: "%1",
	uidRepliedUser: "%1",
	uidRepliedYourself: "%1",
	uidRepliedMessage: "%1",
	adminOnlyEnabled: "Admin-only mode is now %1.",
	adminAddedUser: "Added %1 as a bot admin.",
	adminRemovedUser: "Removed %1 from bot admins.",
	adminList: "Bot admins:\n%1",
	banSuccess: "Banned %1. Reason: %2",
	unbanSuccess: "Unbanned %1.",
	whitelistAdded: "Added %1 to the whitelist.",
	whitelistRemoved: "Removed %1 from the whitelist.",
	addUserSuccess: "Added %1 to this thread.",
	removeUserSuccess: "Removed %1 from this thread.",
	echoEmpty: "Give me something to say.",
	prefixCurrent: "The current prefix is: %1",
	prefixChanged: "Prefix changed to: %1",
	prefixOnlyAdmin: "The current prefix is: %1\nOnly bot admins can change it.",
	avatarChanged: "Profile picture updated.",
	avatarFailed: "Could not change the profile picture.",
	bioChanged: "Bio updated.",
	bioEmpty: "Give me the new bio text.",
	fact: "Random fact: %1",
	joke: "Random joke: %1"
};
