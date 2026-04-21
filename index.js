// ============================================
// 122 TEAM MODMAIL SUPPORT BOT
// ============================================
// DM the bot → Open a ticket → Staff replies in channel → Bot relays as embeds
// Inspired by City Airways modmail system

require('dotenv').config();
const express = require('express');
const https = require('https');
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    Collection,
    AttachmentBuilder
} = require('discord.js');

// ── Web Server for Render ────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('122 Team ModMail Bot is running! 🚀');
});

app.listen(PORT, () => {
    console.log(`🌐  Web server is listening on port ${PORT}`);
});

// ── Client Setup ──────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Channel, // Required for DM events
        Partials.Message,
        Partials.User
    ]
});

// ── In-Memory Ticket Tracking ─────────────────────────────
// Maps: userId -> { channelId, guildId }
const activeTickets = new Collection();
// Maps: channelId -> userId (reverse lookup for staff replies)
const channelToUser = new Collection();
// Track users who are currently being prompted (prevent duplicate prompts)
const pendingPrompts = new Set();

// ── Config ────────────────────────────────────────────────
const CONFIG = {
    token: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    // Support multiple staff roles (comma-separated)
    staffRoleIds: (process.env.STAFF_ROLE_ID || '').split(',').map(id => id.trim()).filter(id => id),
    ticketCategoryId: process.env.TICKET_CATEGORY_ID || null,
    logChannelId: process.env.LOG_CHANNEL_ID || null
};

// ── Brand Colors ──────────────────────────────────────────
const COLORS = {
    PRIMARY: 0x5865F2,   // Discord blurple — ticket prompt
    STAFF: 0x9B59B6,     // Purple — staff messages
    USER: 0x2ECC71,      // Green — user messages
    SUCCESS: 0x57F287,   // Green — ticket opened
    CLOSE: 0xED4245,     // Red — ticket closed
    INFO: 0x3498DB       // Blue — info messages
};

// ============================================
// BOT READY
// ============================================
client.once('ready', async () => {
    console.log(`\n✅  ${client.user.tag} is online!`);
    console.log(`📋  Guild: ${CONFIG.guildId}`);
    console.log(`👮  Staff Roles: ${CONFIG.staffRoleIds.join(', ')}`);
    console.log(`📁  Ticket Category: ${CONFIG.ticketCategoryId || 'None (top of server)'}`);
    console.log(`📝  Log Channel: ${CONFIG.logChannelId || 'None'}\n`);

    client.user.setPresence({
        activities: [{ name: 'DM me for support!', type: 3 }], // "Watching DM me for support!"
        status: 'online'
    });

    // Rebuild ticket maps from existing channels on restart
    await rebuildTicketCache();
});

// ============================================
// REBUILD TICKET CACHE ON RESTART
// ============================================
// Scans for existing ticket channels so the bot survives restarts
async function rebuildTicketCache() {
    try {
        const guild = await client.guilds.fetch(CONFIG.guildId);
        const channels = await guild.channels.fetch();

        channels.forEach(channel => {
            if (channel && channel.name && channel.name.startsWith('ticket-')) {
                // Try to find the topic which stores the user ID
                if (channel.topic) {
                    const userId = channel.topic;
                    activeTickets.set(userId, {
                        channelId: channel.id,
                        guildId: guild.id
                    });
                    channelToUser.set(channel.id, userId);
                }
            }
        });

        if (activeTickets.size > 0) {
            console.log(`🔄  Rebuilt ${activeTickets.size} active ticket(s) from existing channels.`);
        }
    } catch (err) {
        console.error('⚠️  Could not rebuild ticket cache:', err.message);
    }
}

// ============================================
// HANDLE DIRECT MESSAGES
// ============================================
client.on('messageCreate', async (message) => {
    // 🔥 MASSIVE DEBUG LOG TO TRACE DMS
    console.log(`[DEBUG RAW] Saw message! Author: ${message?.author?.tag || 'Unknown'}, IsBot: ${message?.author?.bot || 'Unknown'}, ChannelType: ${message?.channel?.type}`);
    // Fetch partial messages/channels so DMs work properly
    if (message.partial) {
        try { message = await message.fetch(); } catch (err) {
            console.error('⚠️  Could not fetch partial message:', err.message);
            return;
        }
    }
    if (message.channel.partial) {
        try { await message.channel.fetch(); } catch (err) {
            console.error('⚠️  Could not fetch partial channel:', err.message);
            return;
        }
    }

    // Ignore bots
    if (message.author.bot) return;

    // ── DM Message ────────────────────────────────────────
    if (message.channel.type === ChannelType.DM) {
        console.log(`📩  DM received from ${message.author.username}: "${message.content.substring(0, 50)}"`);
        return handleDM(message);
    }

    // ── Guild (Server) Message — Staff Commands ───────────
    if (message.guild) {
        return handleGuildMessage(message);
    }
});

// ============================================
// HANDLE DM LOGIC
// ============================================
async function handleDM(message) {
    const userId = message.author.id;

    // If user already has an active ticket, forward the message
    if (activeTickets.has(userId)) {
        return forwardUserMessage(message);
    }

    // If user is already being prompted, don't send another prompt
    if (pendingPrompts.has(userId)) {
        return;
    }

    // Mark as pending
    pendingPrompts.add(userId);

    // Otherwise, prompt them to open a ticket
    const promptEmbed = new EmbedBuilder()
        .setTitle('📩  Ticket creation confirmation')
        .setDescription('Are you sure you would like to open a ticket?')
        .setColor(COLORS.CLOSE) // Red color
        .setFooter({ text: '122 Team • Support System' })
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_open_yes')
            .setLabel('✅ Open Ticket')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ticket_open_no')
            .setLabel('❌ No Thanks')
            .setStyle(ButtonStyle.Danger)
    );

    try {
        await message.reply({ embeds: [promptEmbed], components: [buttons] });
    } catch (err) {
        console.error('Failed to send ticket prompt:', err.message);
        pendingPrompts.delete(userId); // Clean up on failure
    }
}

// ============================================
// HANDLE BUTTON INTERACTIONS
// ============================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;

    // ── YES — Open Ticket ─────────────────────────────────
    if (interaction.customId === 'ticket_open_yes') {
        // Prevent double-open
        if (activeTickets.has(userId)) {
            pendingPrompts.delete(userId);
            return interaction.reply({
                content: '⚠️ You already have an active ticket! Just send your message here and staff will see it.',
                ephemeral: true
            });
        }

        await interaction.deferUpdate();

        try {
            const guild = await client.guilds.fetch(CONFIG.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            const username = interaction.user.username.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

            // Build permission overwrites
            const permissionOverwrites = [
                {
                    id: guild.id, // @everyone
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: client.user.id, // Bot
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ];

            // Add all staff role permissions
            CONFIG.staffRoleIds.forEach(roleId => {
                permissionOverwrites.push({
                    id: roleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                });
            });

            // Create the ticket channel
            const ticketChannel = await guild.channels.create({
                name: `ticket-${username}`,
                type: ChannelType.GuildText,
                parent: CONFIG.ticketCategoryId || undefined,
                topic: userId, // Store user ID in topic for cache rebuilding
                permissionOverwrites
            });

            // Track it
            activeTickets.set(userId, {
                channelId: ticketChannel.id,
                guildId: guild.id
            });
            channelToUser.set(ticketChannel.id, userId);
            pendingPrompts.delete(userId);

            // Send opening embed to the ticket channel
            const displayName = interaction.user.globalName || interaction.user.username;
            const openEmbed = new EmbedBuilder()
                .setTitle('📬  New Support Ticket')
                .setDescription(
                    `**User:** ${displayName} (<@${userId}>)\n` +
                    `**User ID:** \`${userId}\`\n` +
                    `**Account Created:** <t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>\n` +
                    (member ? `**Joined Server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '')
                )
                .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
                .setColor(COLORS.SUCCESS)
                .setFooter({ text: 'Reply in this channel to respond • !close to close' })
                .setTimestamp();

            const closeButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close')
                    .setLabel('🔒 Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ embeds: [openEmbed], components: [closeButton] });

            // Ping staff roles
            if (CONFIG.staffRoleIds.length > 0) {
                const pings = CONFIG.staffRoleIds.map(id => `<@&${id}>`).join(' ');
                const pingMsg = await ticketChannel.send(`${pings} — New ticket from **${displayName}**`);
                // Delete the ping after 3 seconds to keep it clean
                setTimeout(() => pingMsg.delete().catch(() => {}), 3000);
            }

            // Confirm to the user — update the original prompt message
            const confirmEmbed = new EmbedBuilder()
                .setTitle('✅  Ticket Opened!')
                .setDescription(
                    'Your support ticket has been created.\n\n' +
                    '**Send your messages right here in this DM** and a staff member will respond shortly!'
                )
                .setColor(COLORS.SUCCESS)
                .setFooter({ text: '122 Team • Support System' })
                .setTimestamp();

            await interaction.editReply({ embeds: [confirmEmbed], components: [] });

        } catch (err) {
            console.error('Failed to create ticket:', err);
            pendingPrompts.delete(userId);
            await interaction.editReply({
                content: '❌ Something went wrong creating your ticket. Please try again later.',
                embeds: [],
                components: []
            }).catch(() => {});
        }
    }

    // ── NO — Dismiss ──────────────────────────────────────
    if (interaction.customId === 'ticket_open_no') {
        pendingPrompts.delete(userId);

        const dismissEmbed = new EmbedBuilder()
            .setTitle('👋  No Problem!')
            .setDescription('If you ever need help, just DM me again!')
            .setColor(COLORS.INFO)
            .setTimestamp();

        await interaction.update({ embeds: [dismissEmbed], components: [] });
    }

    // ── CLOSE TICKET (Button) ─────────────────────────────
    if (interaction.customId === 'ticket_close') {
        // Check if user has ANY of the staff roles
        const member = interaction.member;
        const isStaff = member && CONFIG.staffRoleIds.some(roleId => member.roles.cache.has(roleId));
        
        if (!isStaff) {
            return interaction.reply({
                content: '❌ Only staff can close tickets.',
                ephemeral: true
            });
        }

        // Reply first BEFORE closing (channel deletion would kill the interaction)
        await interaction.reply({ content: '🔒 Closing ticket...', ephemeral: true });
        await closeTicket(interaction.channel, interaction.user);
    }
});

// ============================================
// FORWARD USER DM → TICKET CHANNEL
// ============================================
async function forwardUserMessage(message) {
    const ticket = activeTickets.get(message.author.id);
    if (!ticket) return;

    try {
        const guild = await client.guilds.fetch(ticket.guildId);
        // Catch "Unknown Channel" error if staff deleted the channel manually
        const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);

        if (!channel) {
            // Channel was deleted — clean up
            activeTickets.delete(message.author.id);
            channelToUser.delete(ticket.channelId);
            return message.reply('⚠️ Your ticket channel was closed by staff. DM me again to open a new one.');
        }

        // Build embed for the user's message
        const displayName = message.author.globalName || message.author.username;
        const userEmbed = new EmbedBuilder()
            .setAuthor({
                name: displayName,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content || '*No text content*')
            .setColor(COLORS.USER)
            .setFooter({ text: 'Member Message' })
            .setTimestamp();

        // Handle attachments
        const files = [];
        if (message.attachments.size > 0) {
            message.attachments.forEach(a => {
                files.push(new AttachmentBuilder(a.url, { name: a.name }));
            });
        }

        // RED embed for Staff's screen
        const staffScreenEmbed = new EmbedBuilder()
            .setAuthor({
                name: displayName,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content || '*No text content*')
            .setColor(COLORS.CLOSE) // Red
            .setFooter({ text: 'Member Message' })
            .setTimestamp();
            
        if (files.length > 0) {
            staffScreenEmbed.addFields({ name: '📎 Attachments', value: 'Attached below' });
        }

        // Send to staff channel
        await channel.send({ embeds: [staffScreenEmbed], files });

        // GREEN embed for User's screen (echo to confirm it sent)
        const userScreenEmbed = new EmbedBuilder()
            .setAuthor({
                name: "You",
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content || '*No text content*')
            .setColor(COLORS.SUCCESS) // Green
            .setTimestamp();

        if (files.length > 0) {
            userScreenEmbed.addFields({ name: '📎 Attachments', value: 'Attached below' });
        }

        await message.author.send({ embeds: [userScreenEmbed], files }).catch(() => {});

    } catch (err) {
        console.error('Failed to forward user message:', err.message);
        await message.reply('⚠️ Failed to deliver your message. Please try again.').catch(() => {});
    }
}

// ============================================
// HANDLE GUILD MESSAGES (Staff Replies + Commands)
// ============================================
async function handleGuildMessage(message) {
    // Only care about ticket channels
    const userId = channelToUser.get(message.channel.id);
    if (!userId) return;

    // Ignore bot messages entirely
    if (message.author.bot) return;

    // ── !close Command ────────────────────────────────────
    if (message.content.toLowerCase() === '!close') {
        // Check staff roles
        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        const isStaff = member && CONFIG.staffRoleIds.some(roleId => member.roles.cache.has(roleId));
        
        if (!isStaff) {
            return message.reply('❌ Only staff can close tickets.').catch(() => {});
        }
        return closeTicket(message.channel, message.author);
    }

    // ── !transcript Command ───────────────────────────────
    if (message.content.toLowerCase() === '!transcript') {
        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        const isStaff = member && CONFIG.staffRoleIds.some(roleId => member.roles.cache.has(roleId));
        
        if (!isStaff) {
            return message.reply('❌ Only staff can generate transcripts.').catch(() => {});
        }
        return generateTranscript(message.channel, message.author);
    }

    // ── Ignore unrecognized commands (don't forward to user) ──
    if (message.content.startsWith('!')) return;

    // ── Staff Reply → Forward as Embed to User DMs ───────
    try {
        const user = await client.users.fetch(userId);
        const staffDisplayName = message.member?.displayName || message.author.globalName || message.author.username;

        const staffEmbed = new EmbedBuilder()
            .setAuthor({
                name: `${staffDisplayName} • Staff`,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content || '*No text content*')
            .setColor(COLORS.STAFF)
            .setFooter({ text: '122 Team • Staff Response' })
            .setTimestamp();

        // Handle attachments
        const files = [];
        if (message.attachments.size > 0) {
            message.attachments.forEach(a => {
                files.push(new AttachmentBuilder(a.url, { name: a.name }));
            });
        }

        // RED embed for User's screen
        const userScreenEmbed = new EmbedBuilder()
            .setAuthor({
                name: `${staffDisplayName} • Staff`,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content || '*No text content*')
            .setColor(COLORS.CLOSE) // Red
            .setFooter({ text: '122 Team • Staff Response' })
            .setTimestamp();

        if (files.length > 0) {
            userScreenEmbed.addFields({ name: '📎 Attachments', value: 'Attached below' });
        }

        // Send to User
        await user.send({ embeds: [userScreenEmbed], files });

        // GREEN embed for Staff's screen
        const staffScreenEmbed = new EmbedBuilder()
            .setAuthor({
                name: "You (Staff)",
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(message.content || '*No text content*')
            .setColor(COLORS.SUCCESS) // Green
            .setTimestamp();

        if (files.length > 0) {
            staffScreenEmbed.addFields({ name: '📎 Attachments', value: 'Attached below' });
        }

        // Replace staff's raw message with the Green embed
        await message.channel.send({ embeds: [staffScreenEmbed], files });
        await message.delete().catch(() => {});
}

// ============================================
// CLOSE TICKET
// ============================================
async function closeTicket(channel, closedBy) {
    const userId = channelToUser.get(channel.id);
    if (!userId) return;

    try {
        // Notify the user
        const user = await client.users.fetch(userId);
        const closedByName = closedBy.globalName || closedBy.username;
        const closeEmbed = new EmbedBuilder()
            .setTitle('🔒  Ticket Closed')
            .setDescription(
                'Your support ticket has been closed.\n\n' +
                'If you need further assistance, feel free to DM me again to open a new ticket!'
            )
            .setColor(COLORS.CLOSE)
            .setFooter({ text: `Closed by ${closedByName}` })
            .setTimestamp();

        await user.send({ embeds: [closeEmbed] }).catch(() => {
            console.log(`Could not notify user ${userId} about ticket closure (DMs may be closed).`);
        });

        // Log to log channel if configured
        if (CONFIG.logChannelId) {
            await logTicketClose(channel, user, closedBy);
        }

        // Clean up tracking
        activeTickets.delete(userId);
        channelToUser.delete(channel.id);

        // Send closing message to channel, then delete after delay
        const closingEmbed = new EmbedBuilder()
            .setTitle('🔒  Ticket Closed')
            .setDescription(`Closed by ${closedByName}. This channel will be deleted in 5 seconds.`)
            .setColor(COLORS.CLOSE)
            .setTimestamp();

        await channel.send({ embeds: [closingEmbed] });

        // Delete channel after 5 seconds
        setTimeout(async () => {
            try {
                await channel.delete('Ticket closed');
            } catch (err) {
                console.error('Failed to delete ticket channel:', err.message);
            }
        }, 5000);

    } catch (err) {
        console.error('Failed to close ticket:', err);
    }
}

// ============================================
// LOG TICKET CLOSURE
// ============================================
async function logTicketClose(ticketChannel, user, closedBy) {
    try {
        const guild = await client.guilds.fetch(CONFIG.guildId);
        const logChannel = await guild.channels.fetch(CONFIG.logChannelId);

        if (!logChannel) return;

        const userName = user.globalName || user.username;
        const closedByName = closedBy.globalName || closedBy.username;
        const logEmbed = new EmbedBuilder()
            .setTitle('📋  Ticket Closed')
            .setDescription(
                `**User:** ${userName} (\`${user.id}\`)\n` +
                `**Closed By:** ${closedByName}\n` +
                `**Channel:** #${ticketChannel.name}`
            )
            .setColor(COLORS.INFO)
            .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });

    } catch (err) {
        console.error('Failed to log ticket closure:', err.message);
    }
}

// ============================================
// GENERATE TRANSCRIPT
// ============================================
async function generateTranscript(channel, requestedBy) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        let transcript = `📋 TRANSCRIPT — #${channel.name}\n`;
        transcript += `Generated by: ${requestedBy.globalName || requestedBy.username}\n`;
        transcript += `Date: ${new Date().toISOString()}\n`;
        transcript += '═'.repeat(50) + '\n\n';

        sorted.forEach(msg => {
            const time = new Date(msg.createdTimestamp).toLocaleString();
            const author = msg.author.globalName || msg.author.username;
            const content = msg.content || '[Embed/Attachment]';
            transcript += `[${time}] ${author}: ${content}\n`;
        });

        // Send as a text file
        const buffer = Buffer.from(transcript, 'utf-8');
        await channel.send({
            content: '📋 Here is the ticket transcript:',
            files: [{
                attachment: buffer,
                name: `transcript-${channel.name}.txt`
            }]
        });

    } catch (err) {
        console.error('Failed to generate transcript:', err.message);
        await channel.send('⚠️ Failed to generate transcript.').catch(() => {});
    }
}

// ============================================
// ERROR HANDLING
// ============================================
client.on('error', (err) => console.error('Client error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

// ============================================
// LOGIN
// ============================================
if (!CONFIG.token || CONFIG.token === 'YOUR_BOT_TOKEN_HERE') {
    console.error('\n❌  No bot token found!');
    console.error('   → Open the .env file and set DISCORD_TOKEN to your bot token.');
    console.error('   → Get one at: https://discord.com/developers/applications\n');
    process.exit(1);
}

if (!CONFIG.guildId || CONFIG.guildId === 'YOUR_GUILD_ID_HERE') {
    console.error('\n❌  No guild ID found!');
    console.error('   → Open the .env file and set GUILD_ID to your server ID.\n');
    process.exit(1);
}

if (!CONFIG.staffRoleIds || CONFIG.staffRoleIds.length === 0 || CONFIG.staffRoleIds[0] === 'YOUR_STAFF_ROLE_ID_HERE') {
    console.error('\n❌  No staff role IDs found!');
    console.error('   → Open the .env file and set STAFF_ROLE_ID to your staff/mod role ID(s).');
    console.error('   → For multiple roles, separate them with commas: ID1,ID2,ID3\n');
    process.exit(1);
}

client.login(CONFIG.token);

// ── Self-Ping Loop (Keep-Alive) ──────────────────────────
// Pings the bot every 10 minutes to prevent sleep on Render
if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    const hostname = process.env.RENDER_EXTERNAL_HOSTNAME;
    console.log(`📡  Self-ping configured for: https://${hostname}`);
    
    setInterval(() => {
        https.get(`https://${hostname}`, (res) => {
            console.log(`💓  Keep-alive ping sent. Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('⚠️  Keep-alive ping failed:', err.message);
        });
    }, 10 * 60 * 1000); // 10 minutes
}

