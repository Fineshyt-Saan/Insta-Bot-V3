/**
 * @fileoverview NKXICA - Formatting Utilities
 * @author neoaz07 (Saifullah Neoaz)
 * @copyright 2024 NeoKEX
 * @license MIT
 * @module FormatUtils
 * @since 1.0.0
 */

class FormatUtils {
  static formatUser(user) {
    if (!user) return null;
    return {
      userID: (user.pk || user.pk_id || user.id)?.toString(),
      userId: (user.pk || user.pk_id || user.id)?.toString(),
      username: user.username,
      fullName: user.full_name,
      profilePicUrl: user.profile_pic_url,
      profileUrl: `https://instagram.com/${user.username}`,
      isVerified: user.is_verified || false,
      isPrivate: user.is_private || false,
      followerCount: user.follower_count || 0,
      followingCount: user.following_count || 0,
      mediaCount: user.media_count || 0,
      bio: user.biography || user.bio || ''
    };
  }

  static formatThread(thread) {
    if (!thread) return null;
    return {
      threadID: thread.thread_id?.toString(),
      threadId: thread.thread_id?.toString(),
      name: thread.thread_title || '',
      snippet: thread.snippet?.text || '',
      snippetSender: thread.snippet?.sender_id?.toString(),
      serverTimestamp: thread.last_activity_at?.toString(),
      lastActivity: thread.last_activity_at,
      lastSeenAt: thread.last_seen_at,
      participants: thread.users?.map(u => (u.pk || u.pk_id)?.toString()) || [],
      userInfo: thread.users?.map(u => this.formatUser(u)) || [],
      inviter: thread.inviter ? this.formatUser(thread.inviter) : null,
      unreadCount: thread.read_state || 0,
      messageCount: thread.item_count || 0,
      isGroup: thread.is_group === true,
      isPending: thread.pending === true,
      isSpam: thread.is_spam === true,
      isArchived: thread.archived === true,
      muted: thread.muted === true,
      mentionsMuted: thread.mentions_muted === true,
      folder: thread.folder || '',
      hasMore: thread.has_older === true,
      cursor: thread.oldest_cursor || null,
      adminIDs: Array.from(new Set([
        ...(thread.admin_user_ids || thread.adminIDs || thread.adminIds || thread.admin_ids || [])
          .map(a => (typeof a === 'object' ? (a.id || a.userID || a.pk || a.uid) : a)?.toString())
          .filter(Boolean),
        ...(thread.users || [])
          .filter(u => u.is_admin === true || u.isAdmin === true)
          .map(u => (u.pk || u.pk_id || u.id)?.toString())
          .filter(Boolean)
      ])),
      lastMessage: thread.items?.[0] ? this.formatMessage(thread.items[0], thread.thread_id) : null
    };
  }

  static formatMessage(item, threadId, thread = null) {
    if (!item) return null;

    const viewerId = thread?.viewer_id?.toString();
    const senderId = item.user_id?.toString();

    const base = {
      type: 'message',
      senderID: senderId,
      threadID: threadId?.toString(),
      messageID: item.item_id?.toString(),
      timestamp: item.timestamp?.toString(),
      isGroup: thread?.is_group === true,
      isCurrentUser: viewerId ? senderId === viewerId : false,
      replyTo: (item.replied_to_message?.item_id || item.replied_to_message?.id)?.toString()
        || (item.replied_to_item?.item_id || item.replied_to_item?.id)?.toString()
        || item.replied_to_item_id?.toString()
        || item.reply_to_message?.item_id?.toString()
        || item.reply_to_message_id?.toString()
        || null,
      replyToMessage: item.replied_to_message
        ? this.formatMessage(item.replied_to_message, threadId)
        : (item.replied_to_item ? this.formatMessage(item.replied_to_item, threadId) : null),
      mentions: {},
      attachments: [],
      clientContext: item.client_context,
      itemType: item.item_type
    };

    switch (item.item_type) {
      case 'text':
        return { ...base, body: item.text || '' };
      
      case 'media':
      case 'photo':
      case 'raven_media':
      case 'visual_media':
      case 'media_share': {
        const m = item.visual_media?.media || item.raven_media?.media || item.media || item;
        const candidate = m.image_versions2?.candidates?.[0];
        const isVideo = m.media_type === 2 || Boolean(m.video_versions);
        const url = candidate?.url || m.video_versions?.[0]?.url || m.url;
        return {
          ...base,
          body: item.text || m.caption?.text || '',
          attachments: url ? [{
            type: isVideo ? 'video' : 'photo',
            url,
            width: candidate?.width,
            height: candidate?.height,
            mediaId: m.id
          }] : []
        };
      }
      
      case 'voice_media':
        return {
          ...base,
          body: '(Voice message)',
          attachments: [{
            type: 'audio',
            url: item.voice_media?.media?.audio?.audio_clusters?.[0]?.url,
            duration: item.voice_media?.media?.audio?.audio_clusters?.[0]?.duration,
            mediaId: item.voice_media?.media?.id
          }]
        };
      
      case 'video_call_event':
        return { ...base, body: item.video_call_event?.description || '(Video call)' };
      
      case 'like':
        return { ...base, body: '❤️' };
      
      case 'link':
        return {
          ...base,
          body: item.link?.text || '',
          attachments: [{
            type: 'share',
            url: item.link?.link_context?.link_url,
            title: item.link?.link_context?.link_title
          }]
        };
      
      case 'animated_media':
        return {
          ...base,
          body: '(GIF)',
          attachments: [{
            type: 'animated_image',
            url: item.animated_media?.images?.fixed_height?.url
          }]
        };
      
      case 'reel_share':
      case 'clip':
        return { ...base, body: item.text || '(Story/Clip share)' };
      
      case 'story_share':
        return { ...base, body: item.story_share?.text || '(Story share)' };
      
      case 'video':
        return {
          ...base,
          body: '(Video)',
          attachments: [{
            type: 'video',
            url: item.video_versions?.[0]?.url,
            width: item.video_versions?.[0]?.width,
            height: item.video_versions?.[0]?.height
          }]
        };
      
      case 'location':
        return {
          ...base,
          body: item.location?.name || '(Location)',
          attachments: [{
            type: 'location',
            latitude: item.location?.lat,
            longitude: item.location?.lng,
            name: item.location?.name
          }]
        };
      
      case 'profile':
        return {
          ...base,
          body: `(Profile: ${item.profile?.username})`,
          attachments: [{
            type: 'profile',
            user: this.formatUser(item.profile)
          }]
        };
      
      default:
        return { ...base, body: `(Unknown: ${item.item_type})`, raw: item };
    }
  }

  static formatEvent(item, threadId, thread = null) {
    return this.formatMessage(item, threadId, thread);
  }

  static formatInbox(inbox) {
    if (!inbox) return { threads: [], hasMore: false, cursor: null };
    
    return {
      threads: inbox.threads?.map(t => this.formatThread(t)) || [],
      hasMore: inbox.has_older === true,
      cursor: inbox.oldest_cursor || null,
      unseenCount: inbox.unseen_count || 0,
      seqId: inbox.seq_id,
      snapshotAt: inbox.snapshot_at_ms
    };
  }

  static formatID(id, type = 'thread') {
    if (!id) return null;
    const str = id.toString();
    
    if (type === 'thread') {
      return str.startsWith('t_') ? str.substring(2) : str;
    }
    
    if (type === 'user') {
      return str.startsWith('u_') ? str.substring(2) : str;
    }
    
    if (type === 'message') {
      return str.startsWith('m_') ? str.substring(2) : str;
    }
    
    return str;
  }

  static parseID(id) {
    if (!id) return { type: 'unknown', id: null };
    const str = id.toString();
    
    if (str.startsWith('t_')) return { type: 'thread', id: str.substring(2) };
    if (str.startsWith('u_')) return { type: 'user', id: str.substring(2) };
    if (str.startsWith('m_')) return { type: 'message', id: str.substring(2) };
    
    return { type: 'unknown', id: str };
  }

  static isGroupThread(thread) {
    return thread?.is_group === true || thread?.participants?.length > 2;
  }

  static getThreadName(thread) {
    if (thread.name) return thread.name;
    if (thread.userInfo?.length === 1) return thread.userInfo[0].fullName;
    return thread.threadID;
  }
}

module.exports = FormatUtils;