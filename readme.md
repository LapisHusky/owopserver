# OWOP Server
This is a server for https://ourworldofpixels.com. It's written in Node.js and designed to be more performant than other js OWOP servers out there.

## How to use
1. Install Node.js and pnpm
2. Clone or download this repo
3. Rename .env.example to .env, then configure the variables inside of it according to the comments
4. If you wish, configure some other server properties in config.json
5. Run `pnpm install` from a command prompt in the server directory
6. Run `pnpm run start` to start the server

## About
I made this mostly as a fun project to see if I could. I've coded in OWOP for a decent amount of time, but only ever from the client's side.
Seeing that the official server often had issues with lag and other OWOP servers I've found also did, I set out to write a better server that would have a lot less of those issues.
A decent amount of benchmarking went into this to optimize some of the more heavily used parts of the server, such as chunk loading.
Of course, being in an interpreted language, there is going to be some slowdown compared to the official server which is in C++. Hopefully other optimizations I've made can make up for that difference, or at least get close.

This includes: support for all tools, all user and moderator commands, most world properties, banning, captcha, HTTP api without some of the secret messages, and a good portion of the admin commands.

### Feature requests and bug reports
You can propose features to me on Discord: lapisfloof
If you find a bug or issue, let me know through Discord and I will most likely fix it.
