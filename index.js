const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');

function createBot() {
   const bot = mineflayer.createBot({
      username: config['bot-account']['username'],
      password: config['bot-account']['password'],
      auth: config['bot-account']['type'],
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
   });

   bot.loadPlugin(pathfinder);
   const mcData = require('minecraft-data')(bot.version);
   const defaultMove = new Movements(bot, mcData);
   bot.settings.colorsEnabled = false;

   let pendingPromise = Promise.resolve();

   function sendRegister(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/register ${password} ${password}`);
         console.log(`[Auth] Sent /register command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`); // Log all chat messages

            // Check for various possible responses
            if (message.includes('successfully registered')) {
               console.log('[INFO] Registration confirmed.');
               resolve();
            } else if (message.includes('already registered')) {
               console.log('[INFO] Bot was already registered.');
               resolve(); // Resolve if already registered
            } else if (message.includes('Invalid command')) {
               reject(`Registration failed: Invalid command. Message: "${message}"`);
            } else {
               reject(`Registration failed: unexpected message "${message}".`);
            }
         });
      });
   }

   function sendLogin(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/login ${password}`);
         console.log(`[Auth] Sent /login command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`); // Log all chat messages

            if (message.includes('successfully logged in')) {
               console.log('[INFO] Login successful.');
               resolve();
            } else if (message.includes('Invalid password')) {
               reject(`Login failed: Invalid password. Message: "${message}"`);
            } else if (message.includes('not registered')) {
               reject(`Login failed: Not registered. Message: "${message}"`);
            } else {
               reject(`Login failed: unexpected message "${message}".`);
            }
         });
      });
   }

   bot.once('spawn', () => {
      console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

      if (config.utils['auto-auth'].enabled) {
         console.log('[INFO] Started auto-auth module');

         const password = config.utils['auto-auth'].password;

         pendingPromise = pendingPromise
            .then(() => sendRegister(password))
            .then(() => sendLogin(password))
            .catch(error => console.error('[ERROR]', error));
      }

      if (config.utils['chat-messages'].enabled) {
         console.log('[INFO] Started chat-messages module');
         const messages = config.utils['chat-messages']['messages'];

         if (config.utils['chat-messages'].repeat) {
            const delay = config.utils['chat-messages']['repeat-delay'];
            let i = 0;

            let msg_timer = setInterval(() => {
               bot.chat(`${messages[i]}`);

               if (i + 1 === messages.length) {
                  i = 0;
               } else {
                  i++;
               }
            }, delay * 1000);
         } else {
            messages.forEach((msg) => {
               bot.chat(msg);
            });
         }
      }

      const pos = config.position;

      if (config.position.enabled) {
         console.log(
            `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
         );
         bot.pathfinder.setMovements(defaultMove);
         bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      }

      if (config.utils['anti-afk'].enabled) {
         bot.setControlState('jump', true);
         if (config.utils['anti-afk'].sneak) {
            bot.setControlState('sneak', true);
         }
      }

      // Store original position for movement
      const originalPosition = { x: bot.entity.position.x, z: bot.entity.position.z };
      
      console.log('[INFO] Started anti-idle system: auto-click every 30s, movement every 60s, logs every 30min');
      
      // Movement variables
      let isMovingForward = true;
      let movementSteps = 0;
      
      // Auto-click every 30 seconds (silent)
      let clickCount = 0;
      setInterval(() => {
         bot.swingArm();
         clickCount++;
      }, 30000);
      
      // Movement every 60 seconds - 2 steps forward, then 2 steps back
      setInterval(() => {
         if (isMovingForward && movementSteps < 2) {
            // Move forward
            bot.setControlState('forward', true);
            setTimeout(() => bot.setControlState('forward', false), 500);
            movementSteps++;
         } else if (!isMovingForward && movementSteps > 0) {
            // Move backward
            bot.setControlState('back', true);
            setTimeout(() => bot.setControlState('back', false), 500);
            movementSteps--;
         }
         
         // Switch direction when reaching limits
         if (isMovingForward && movementSteps >= 2) {
            isMovingForward = false;
         } else if (!isMovingForward && movementSteps <= 0) {
            isMovingForward = true;
         }
      }, 60000);
      
      // Status log every 30 minutes to save credits
      setInterval(() => {
         console.log(`[Status] Bot active - ${clickCount} clicks performed, position: ${Math.round(bot.entity.position.x)}, ${Math.round(bot.entity.position.z)}`);
         clickCount = 0; // Reset counter
      }, 1800000);
   });

   bot.on('goal_reached', () => {
      console.log(
         `\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`
      );
   });

   bot.on('death', () => {
      console.log(
         `\x1b[33m[AfkBot] Bot has died and was respawned at ${bot.entity.position}`,
         '\x1b[0m'
      );
   });

   if (config.utils['auto-reconnect']) {
      bot.on('end', () => {
         setTimeout(() => {
            createBot();
         }, config.utils['auto-reconnect-delay']);
      });
   }

   bot.on('kicked', (reason) =>
      console.log(
         '\x1b[33m',
         `[AfkBot] Bot was kicked from the server. Reason: \n${reason}`,
         '\x1b[0m'
      )
   );

   bot.on('error', (err) =>
      console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m')
   );
}

createBot();
