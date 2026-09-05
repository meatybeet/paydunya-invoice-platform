# How to go live

This guide takes the PayDunya Invoice Platform from your computer to a real address on the
internet, where real customers can open a payment link and pay you.

It is written for someone who is **not** a developer. Every command is shown in full, and after
each step you are told what you should see if it worked. If you see something different, stop and
read the troubleshooting table at the end (section 14) before continuing.

You do not need to understand the code. You need to be able to copy a command, paste it into a
black terminal window, press Enter, and read the answer.

---

## Table of contents

| # | Section |
|---|---------|
| 0 | [Words you will see in this guide](#0-words-you-will-see-in-this-guide) |
| 1 | [What you need before you start](#1-what-you-need-before-you-start) |
| 2 | [Getting PayDunya live keys (RCCM and NINEA in Senegal)](#2-getting-paydunya-live-keys-rccm-and-ninea-in-senegal) |
| 3 | [Getting a server](#3-getting-a-server) |
| 4 | [The database](#4-the-database) |
| 5 | [Installing the application](#5-installing-the-application) |
| 6 | [The .env file, explained line by line](#6-the-env-file-explained-line-by-line) |
| 7 | [HTTPS with Caddy](#7-https-with-caddy) |
| 8 | [Keeping it running with systemd](#8-keeping-it-running-with-systemd) |
| 9 | [Serving the frontend](#9-serving-the-frontend) |
| 10 | [Email setup](#10-email-setup) |
| 11 | [Security checklist before opening to the public](#11-security-checklist-before-opening-to-the-public) |
| 12 | [Backups](#12-backups) |
| 13 | [Testing it end to end](#13-testing-it-end-to-end) |
| 14 | [Troubleshooting](#14-troubleshooting) |

---

## 0. Words you will see in this guide

Read this once. You do not need to memorise it; come back when a word confuses you.

| Word | What it means here |
|---|---|
| **Server / VPS** | A computer you rent, that runs 24 hours a day in a data centre. VPS means "Virtual Private Server": a slice of a big machine, rented to you alone. Your application runs there instead of on your laptop, because your laptop is not always on and is not reachable from the internet. |
| **Terminal / SSH** | The black window where you type commands. SSH is the tool that connects the terminal on your computer to the terminal on your server. |
| **Domain name** | The human address, for example `factures.mondomaine.sn`. Without it, people would have to remember a number like `51.210.44.12`. |
| **DNS** | The phone book that turns a domain name into the server's number (its IP address). |
| **HTTPS** | The padlock in the browser. It encrypts traffic. PayDunya and modern browsers require it. |
| **Certificate** | The file that proves your domain is really yours, which makes HTTPS possible. Caddy gets it for you, free, automatically. |
| **Reverse proxy** | A doorman program sitting in front of your application. The public talks to the doorman on the normal web ports (80 and 443); the doorman handles HTTPS and passes the request inwards to your application on port 8000. Your application never has to deal with certificates itself. |
| **Environment variable** | A setting given to a program from outside its code — a name and a value, like `PAYDUNYA_MODE=live`. This project keeps them in a file called `backend/.env`. Passwords and keys live there, which is why that file must never be shared or committed. |
| **systemd service** | The part of Linux that starts programs automatically. A "service" is a small file that tells Linux: start this application at boot, and restart it if it crashes. |
| **Callback** | A message PayDunya's servers send **directly to your server** to say "this invoice has been paid". It does not go through the customer's browser. This is why your server must be reachable from the internet. |
| **Port** | A numbered door on a machine. Websites use 80 (plain) and 443 (HTTPS). This application listens on 8000, privately. |
| **MongoDB** | The database that stores your users, businesses, products and invoices. |
| **Uploads folder** | `backend/uploads/`, where images of businesses and products are stored as real files on the server's disk. They are **not** inside the database. This matters for backups. |

### How the pieces fit together

```
   Customer's browser  ──HTTPS──>  Caddy (ports 80/443)  ──>  Application (port 8000)
                                                                  │
   PayDunya servers  ──HTTPS callback──>  Caddy  ──>  Application ─┼──>  MongoDB (data)
                                                                  └──>  uploads/ (images)
```

One important fact about this project: **the application serves the website and the API together**,
from the same address. You do not need a second web server for the frontend. That keeps everything
on one domain and avoids a whole class of problems.

---

## 1. What you need before you start

Gather these four things first. Nothing later in the guide works without them.

### 1.1 A domain name

A domain is your public address. Buy one from any registrar (Namecheap, OVH, Gandi, or a Senegalese
`.sn` registrar). A `.com` typically costs on the order of 10 to 15 US dollars per year; `.sn`
domains are priced separately by the local registry — check the current price at purchase time.

You will use a single name for everything, for example `factures.mondomaine.com`.

**Why:** PayDunya must be able to reach your server by name, over HTTPS. Certificates are issued to
names, not to bare IP addresses.

### 1.2 A server

A small VPS is plenty. See section 3 for concrete providers. Budget roughly 5 to 10 US dollars per
month for a machine with 1 to 2 GB of memory.

### 1.3 A PayDunya account, verified for live mode

Free to create. PayDunya takes a commission on each transaction — **check the current rate on your
PayDunya dashboard or ask their support; do not rely on a number quoted in a guide.** Getting out of
test mode requires business verification. See section 2, which is written for Senegal.

### 1.4 An email account for sending invoices

The application emails the invoice to the customer after payment. You need an SMTP account: a Gmail
account with an app password works, and so does a dedicated sending service. See section 10.

### 1.5 On your own computer

- An SSH client. On Windows 10/11, PowerShell already has `ssh` built in — nothing to install.
- Your project files, or access to the GitHub repository
  `https://github.com/meatybeet/paydunya-invoice-platform`.

### Checklist before continuing

- [ ] Domain purchased, and I can log in to the registrar to edit DNS records
- [ ] Payment method ready for a VPS
- [ ] PayDunya account created
- [ ] Email account chosen for sending invoices

---

## 2. Getting PayDunya live keys (RCCM and NINEA in Senegal)

### 2.1 Test mode versus live mode

PayDunya has two completely separate worlds:

| | Test mode (sandbox) | Live mode |
|---|---|---|
| Address used by the app | `https://app.paydunya.com/sandbox-api/v1` | `https://app.paydunya.com/api/v1` |
| Setting in `.env` | `PAYDUNYA_MODE=test` | `PAYDUNYA_MODE=live` |
| Keys | Test keys | Live keys (different values) |
| Money | Nothing real moves | Real money, real fees |
| Requires verification | No | **Yes** |

Your application already knows how to switch: it reads `PAYDUNYA_MODE` and picks the right address
by itself. You never edit code for this — you edit one line of the `.env` file.

**Until PayDunya has verified your business, only test mode works.** You can deploy everything in
this guide today with test keys, confirm the whole flow works, and switch a single line to `live`
the day your verification is approved. That is the recommended order.

### 2.2 What PayDunya asks for

To activate live payments, PayDunya asks for proof that the business is real. In Senegal that means
two identifiers:

- **RCCM** — *Registre du Commerce et du Crédit Mobilier*. Your commercial registration number.
- **NINEA** — *Numéro d'Identification Nationale des Entreprises et Associations*. Your tax
  identification number.

They will also ask for an identity document of the owner and bank or mobile-money details for
payouts.

### 2.3 How to get RCCM and NINEA in Senegal

In Senegal both are produced by a **single registration procedure**, handled through **APIX**
(*Agence nationale chargée de la Promotion de l'Investissement et des Grands Travaux*), which runs
the business creation one-stop shop (*guichet unique*). You do not go to two different offices for
two different numbers: one registration file produces the RCCM registration and the NINEA
attribution.

For one person operating alone, the simplest legal form is the **Entreprise Individuelle (EI)**:

- one owner, no minimum share capital, and no company statutes to draft,
- the cheapest and fastest form to register,
- the trade-off is that the business is not a separate legal person from you, so your personal
  assets are not shielded from business debts.

If you later need to protect personal assets or take on partners, a **SARL** or **SUARL** is the
next step, but it requires statutes and costs more. Registering an EI first, and changing later, is
a normal path.

**What to do:**

1. Go to the APIX business creation portal or a *guichet unique* office in person.
2. Ask to register an **Entreprise Individuelle**.
3. Bring your national identity document (or passport) and the address of your activity. Ask the
   agent for the exact current list of required pieces — it changes.
4. **Ask them, at the counter, what it costs and how long it takes.** Fees and delays are revised
   periodically. Do not trust any figure written in a guide, including this one — I am deliberately
   not quoting a price or a timeline, because a wrong number here would cost you a wasted trip.
5. When you receive your documents, keep a clear scan of the RCCM and the NINEA. PayDunya will ask
   you to upload them.

### 2.4 Submitting verification to PayDunya

1. Log in to `https://app.paydunya.com`.
2. Open your account/business settings and find the verification or *conformité* section.
3. Upload the RCCM, the NINEA, and your identity document.
4. Submit and wait for their review. If they ask for something extra, answer quickly — the file
   usually stalls on a missing document, not on a refusal.

**What you should see if it worked:** your dashboard stops showing the account as unverified, and a
set of **live** keys becomes available.

### 2.5 Collecting the four values you need

Whether test or live, your application needs exactly four values from PayDunya:

| Value | Where it goes in `.env` |
|---|---|
| Master Key | `PAYDUNYA_MASTER_KEY` |
| Private Key | `PAYDUNYA_PRIVATE_KEY` |
| Token | `PAYDUNYA_TOKEN` |
| Store name (chosen by you, shown on the checkout page) | `PAYDUNYA_STORE_NAME` |

Write them down somewhere safe now. **The private key and the master key are passwords.** Anyone who
has them can create charges on your account.

---

## 3. Getting a server

### 3.1 Which one

Any of these are fine, beginner-friendly and cheap. Pick one:

| Provider | Notes |
|---|---|
| **Hetzner Cloud** | Very good value in Europe. The smallest shared-CPU plan is enough. |
| **DigitalOcean** | The clearest documentation for beginners. Their smallest "Droplet" works. |
| **Vultr** | Wide choice of locations. |
| **OVHcloud** | Has infrastructure closer to West Africa and a French-language interface. |

**Specification to choose:** 1 vCPU, **2 GB of memory**, 20 GB or more of disk, running
**Ubuntu 24.04 LTS** (or 22.04 LTS). 1 GB works if you use MongoDB Atlas as recommended in
section 4; take 2 GB if you plan to run the database on the same machine.

Choose a location physically close to your customers if the provider offers one (Europe is the usual
practical choice for Senegal).

**Why a VPS and not shared web hosting:** this application is a long-running Python program, not a
set of PHP pages. It needs to stay in memory permanently to receive PayDunya callbacks. Cheap shared
hosting cannot do that.

### 3.2 Point your domain at the server

Your provider gives you the server's **IP address**, four numbers like `51.210.44.12`.

1. Log in to the registrar where you bought the domain.
2. Open the DNS settings.
3. Create an **A record**:
   - Name/Host: `factures` (or `@` if you want the bare domain)
   - Value/Points to: your server's IP address
   - TTL: leave the default

Wait a few minutes, then check from your own computer:

```bash
nslookup factures.mondomaine.com
```

**What you should see:** the answer contains your server's IP address. If it still shows an old
address or an error, wait — DNS changes can take up to an hour to spread.

Do not continue to section 7 until this works. Caddy cannot get an HTTPS certificate for a domain
that does not point at the server yet.

### 3.3 Connect to the server

From PowerShell on your computer:

```bash
ssh root@factures.mondomaine.com
```

The first time it asks whether to trust the machine — type `yes`. Then enter the password your
provider emailed you (or it logs in directly if you gave it an SSH key).

**What you should see:** a prompt that ends with `#`, and a line naming Ubuntu. You are now typing
commands on the server, not on your computer.

### 3.4 Create a normal user and basic protection

Running everything as `root` means one bad command destroys the machine. Create a normal account:

```bash
adduser deploy
```

Answer the password prompt; the other questions (full name, room number) can be left empty by
pressing Enter.

```bash
usermod -aG sudo deploy
```

**Why:** `deploy` can now run administrative commands by typing `sudo` in front of them, but not by
accident.

Update the system:

```bash
apt update && apt upgrade -y
```

Turn on the firewall, allowing only what you need:

```bash
ufw allow OpenSSH
```

```bash
ufw allow 80
```

```bash
ufw allow 443
```

```bash
ufw --force enable
```

Check it:

```bash
ufw status
```

**What you should see:** a table showing `22/tcp`, `80`, and `443` as `ALLOW`. Port 8000 is
deliberately **not** open: the application must only be reachable through Caddy.

Now log out and back in as `deploy`:

```bash
exit
```

```bash
ssh deploy@factures.mondomaine.com
```

**What you should see:** a prompt ending in `$` instead of `#`. Everything from here is done as
`deploy`.

---

## 4. The database

### 4.1 The recommendation: managed MongoDB, with a real backup plan

**For a real business, use a paid managed MongoDB plan that includes backups (for example Atlas
Flex or a dedicated tier).** Atlas is MongoDB's own hosted service: you do not install or patch the
database server yourself. The free M0 tier is fine for a demo, training, or a short pilot, but it
does **not** include managed backups, so it is not the right place for the only copy of live invoices.

Honest trade-off:

| | Managed Atlas plan (recommended for production) | Self-hosted with the included Docker container |
|---|---|---|
| Setup | A web form, 10 minutes | Install Docker, run the container |
| Cost | Paid after any trial/free allowance | Free, but needs a bigger VPS (more memory) |
| Backups | Available on plans that include backups; still test restores | **Entirely your responsibility** |
| Security patches | Handled for you | Your responsibility |
| Storage limit | 512 MB — thousands of invoices, but images do not count (they live on your disk) | Only your disk size |
| Speed | Slightly slower: the database is on another machine across the network | Slightly faster: same machine |
| If the VPS dies | Your data survives | Your data dies with it unless you had backups |
| Control | You cannot tune the server | Full control |

For an invoicing application handling text records, the small network delay is irrelevant. The
protection against losing everything is not. Start with managed Atlas if your budget allows it. If
you use the M0 free tier temporarily, make an off-site `mongodump` yourself every day and practise
restoring it before you accept real payments.

The `docker-compose.yml` in this repository exists for **local development on your own computer** —
when `MONGODB_URL` is `mongodb://localhost:27017`, running `python main.py` starts that container
automatically. On the server we point at Atlas instead, so that code path is never used.

### 4.2 Creating the Atlas database

1. Go to `https://www.mongodb.com/cloud/atlas/register` and create an account.
2. Create a new project, then **Build a Database** and choose a plan with backups for production.
   You may choose **M0 (free)** only for a demo or if you commit to the manual backup procedure in
   section 12 from day one.
3. Pick a region — Europe (Ireland or Frankfurt) is a reasonable choice for Senegal.
4. On the **Database Access** page, create a database user:
   - username: `paydunya`
   - password: click **Autogenerate Secure Password** and **copy it somewhere safe now**. You cannot
     read it again later.
5. On the **Network Access** page, add your server's IP address.
   - Click **Add IP Address**, enter the server's IP, and give it a comment like `VPS production`.
   - Atlas offers `0.0.0.0/0` ("allow from anywhere"). Avoid it. Your database password would then
     be the only thing standing between the internet and your customers' data.
6. Back on the database view, click **Connect** -> **Drivers** -> **Python**. Copy the connection
   string. It looks like:

```text
mongodb+srv://<atlas-username>:<atlas-password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
```

7. Replace `<password>` with the real password you copied in step 4. If the password contains
   symbols like `@`, `:`, `/` or `#`, regenerate it until it contains only letters and digits —
   that avoids a whole category of confusing connection errors.

Keep that finished string. It goes into `MONGODB_URL` in section 6.

**What you should see if it worked:** in Atlas, the cluster shows as green/active, and the Database
Access page lists your `paydunya` user.

---

## 5. Installing the application

All commands in this section are run on the server, logged in as `deploy`.

### 5.1 Install what Python needs

```bash
sudo apt install -y python3 python3-venv python3-pip git
```

Check the version:

```bash
python3 --version
```

**What you should see:** `Python 3.11.x` or higher. This project uses modern Python syntax and needs
**3.10 at the very minimum**; Ubuntu 24.04 ships 3.12, which is ideal. If you see 3.9 or lower, you
are on an old Ubuntu — rebuild the server with 24.04 rather than fighting it.

### 5.2 Get the application files

Choose a folder and take ownership of it:

```bash
sudo mkdir -p /opt/paydunya
```

```bash
sudo chown deploy:deploy /opt/paydunya
```

**Why `/opt`:** on Linux, `/opt` is the conventional home for applications installed by hand. Any
folder would work, but every path in this guide assumes this one.

Now copy the code in. **Option A — from GitHub** (works if the repository is public):

```bash
git clone https://github.com/meatybeet/paydunya-invoice-platform.git /opt/paydunya/app
```

If the repository is private, GitHub will ask for a username and password and refuse your normal
password. Either make the repository public, or create a Personal Access Token in GitHub settings
and paste that as the password, or use Option B.

**Option B — copy from your own computer.** Run this in PowerShell **on your computer**, not on the
server:

```bash
scp -r C:/Users/alban/.ssh/paydunya-invoice-platform deploy@factures.mondomaine.com:/opt/paydunya/app
```

Either way, check the result on the server:

```bash
ls /opt/paydunya/app
```

**What you should see:** `backend`, `frontend`, `README.md`, `docker-compose.yml` and a few other
entries.

### 5.3 Create the virtual environment

```bash
python3 -m venv /opt/paydunya/venv
```

**Why:** a virtual environment is a private box of Python libraries belonging to this application
only. Without it, installing libraries here could break other programs on the server, and vice
versa.

Install the application's libraries into that box:

```bash
/opt/paydunya/venv/bin/pip install --upgrade pip
```

```bash
/opt/paydunya/venv/bin/pip install -r /opt/paydunya/app/backend/requirements.txt
```

**What you should see:** a list of packages ending with a line beginning `Successfully installed`,
mentioning `fastapi`, `uvicorn`, `motor`, `pydantic-settings`, `httpx` and `python-multipart`.

If it fails with a compiler error, install the build tools and try the last command again:

```bash
sudo apt install -y build-essential python3-dev
```

### 5.4 Create the uploads folder

```bash
mkdir -p /opt/paydunya/app/backend/uploads
```

**Why:** images of businesses and products are saved here as ordinary files. The application creates
this folder on startup, but making it now means you can set permissions and remember it exists —
you will need to back it up (section 12).

---

## 6. The `.env` file, explained line by line

### 6.1 What this file is

`backend/.env` is a plain text file of settings, one per line, in the form `NAME=value`. The
application reads it when it starts. **It contains your passwords and your PayDunya keys.** Treat it
like a bank card PIN:

- never send it by email or WhatsApp,
- never commit it to Git (the project's `.gitignore` already excludes it — do not undo that),
- never paste its contents into a chat, an issue tracker, or a support ticket.

### 6.2 Create it from the example

```bash
cp /opt/paydunya/app/backend/.env.example /opt/paydunya/app/backend/.env
```

Restrict who can read it:

```bash
chmod 600 /opt/paydunya/app/backend/.env
```

**Why:** `600` means "only the owner may read or write this file". Other accounts on the server
cannot open it.

### 6.3 Generate a strong AUTH_SECRET

`AUTH_SECRET` is the key used to sign login tokens. If somebody guesses it, they can forge a token
and log in as your administrator without knowing any password. It must be long and random, and it
must **not** be a phrase you invented.

Generate one:

```bash
/opt/paydunya/venv/bin/python -c "import secrets; print(secrets.token_urlsafe(48))"
```

**What you should see:** a single line of about 64 random characters, for example
`kJ2n-QwvT8sZ...`. Copy it. If you prefer, `openssl rand -base64 48` produces an equally good value.

Never reuse the example value `replace-with-a-long-random-secret`. Changing `AUTH_SECRET` later logs
everyone out immediately — that is expected, and is also how you would respond to a suspected leak.

### 6.4 Edit the file

```bash
nano /opt/paydunya/app/backend/.env
```

`nano` is a simple text editor. Arrow keys move the cursor, typing inserts text. When you are done:
`Ctrl+O` then `Enter` to save, `Ctrl+X` to quit.

### 6.5 Every setting, explained

Make the file look like this, with your own values.

```env
APP_NAME=PayDunya Invoice Platform
API_PREFIX=/api

# --- Database -------------------------------------------------------------
MONGODB_URL=mongodb+srv://<atlas-username>:<atlas-password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=paydunya_invoice_platform

# --- First administrator --------------------------------------------------
SUPER_ADMIN_EMAIL=vous@votredomaine.com
SUPER_ADMIN_PASSWORD=a-long-password-you-choose-yourself
AUTH_SECRET=paste-the-random-value-you-generated-above

# --- PayDunya -------------------------------------------------------------
PAYDUNYA_MODE=test
PAYDUNYA_MASTER_KEY=your_master_key
PAYDUNYA_PRIVATE_KEY=your_private_key
PAYDUNYA_TOKEN=your_token
PAYDUNYA_STORE_NAME=DIALLO & FILS
PAYDUNYA_CALLBACK_URL=https://factures.mondomaine.com/api/payments/callback
PAYDUNYA_RETURN_URL=https://factures.mondomaine.com/api/payments/success
PAYDUNYA_CANCEL_URL=https://factures.mondomaine.com/api/payments/cancel

# --- Public address of the site ------------------------------------------
FRONTEND_URL=https://factures.mondomaine.com
# Leave empty in this standard same-domain setup.
CORS_ORIGINS=

# --- Uploaded images ------------------------------------------------------
UPLOAD_DIR=uploads
MAX_UPLOAD_BYTES=2097152

# --- Email (see section 10) ----------------------------------------------
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=vous@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM=DIALLO & FILS <vous@gmail.com>
SMTP_STARTTLS=true
```

Line by line:

| Setting | What it does | Warnings |
|---|---|---|
| `APP_NAME` | Title shown in the API documentation. | Cosmetic. |
| `API_PREFIX` | Every API address starts with this. | **Leave it as `/api`.** Changing it breaks the frontend and every URL in this guide. |
| `MONGODB_URL` | Where the database is. Paste the Atlas string from section 4. | If it is left as `mongodb://localhost:27017`, the app expects a local database and will fail on a server that has none. |
| `MONGODB_DB` | Name of the database inside the cluster. | Fine as is. |
| `SUPER_ADMIN_EMAIL` | The first administrator account, created automatically on first start. | Use a real address you control. |
| `SUPER_ADMIN_PASSWORD` | Its password. Minimum 8 characters. | **Must be changed from the example.** This account can see everything. Use at least 16 characters. It is only used to create the account on the very first start; after that, the account in the database is what matters. |
| `AUTH_SECRET` | Signs login tokens. | Use the generated value from 6.3. Never a phrase. |
| `PAYDUNYA_MODE` | `test` or `live`. Selects the sandbox or the real PayDunya API. | Keep `test` until verification is approved **and** you have live keys pasted in. |
| `PAYDUNYA_MASTER_KEY` | From your PayDunya dashboard. Also used to verify that a callback really came from PayDunya. | Secret. If it is wrong or empty, **every callback is rejected** and payments never confirm. |
| `PAYDUNYA_PRIVATE_KEY` | From your PayDunya dashboard. | Secret. |
| `PAYDUNYA_TOKEN` | From your PayDunya dashboard. | Secret. |
| `PAYDUNYA_STORE_NAME` | Shown to the customer on the PayDunya checkout page. | Use the real trading name. |
| `PAYDUNYA_CALLBACK_URL` | Where PayDunya sends the "it is paid" message. | **Must be your public HTTPS address.** See 6.6. |
| `PAYDUNYA_RETURN_URL` | Where the customer's browser is sent after a successful payment. The application redirects from there to the invoice page. | Public HTTPS address. |
| `PAYDUNYA_CANCEL_URL` | Where the browser goes if the customer abandons. | Public HTTPS address. |
| `FRONTEND_URL` | Used to build the permanent invoice link that is printed inside each invoice. | Must be the public address with **no trailing slash**. If this is wrong, every permanent link you send to customers is wrong. |
| `CORS_ORIGINS` | Browser origins allowed to call the API from another domain. | Leave empty when this app serves the website itself. See section 11.2 before adding anything. |
| `UPLOAD_DIR` | Folder for uploaded images, relative to `backend/`. | Leave as `uploads`. |
| `MAX_UPLOAD_BYTES` | Largest allowed image. `2097152` is 2 MB. | Raising it lets people fill your disk. |
| `SMTP_*` | Sending email. See section 10. | Configure these before accepting real payments: without them the payment still confirms, but the required invoice email cannot be delivered. |

### 6.6 Why the PayDunya URLs cannot be localhost

This is the single most misunderstood point in the whole deployment, so it gets its own explanation.

When a customer pays, two separate things happen:

1. **The customer's browser** is redirected back to your `PAYDUNYA_RETURN_URL`. That is a normal
   browser visit.
2. **PayDunya's own servers**, sitting in a data centre far away, open a connection to your
   `PAYDUNYA_CALLBACK_URL` and post the payment result. This is the message the application trusts
   to mark the invoice as paid. **It is what makes an invoice change from "en attente" to "payée".**

`localhost` and `127.0.0.1` mean "this same machine, talking to itself". If your callback URL says
`http://localhost:8000/api/payments/callback`, PayDunya's server tries to call **its own** machine,
finds nothing, and gives up. Your invoice stays unpaid forever, even though the money moved.

The same applies to a private address like `192.168.1.20`, and to a laptop with no public name.

That is why you need:

- a **domain name** (section 1.1 and 3.2), so there is a stable public address to call,
- **HTTPS** (section 7), because PayDunya expects a secure endpoint and browsers refuse to send
  customers through insecure pages,
- a **server that is always on** (section 3), because a callback that arrives while your machine is
  asleep is lost.

For local testing only, the project supports a temporary Cloudflare tunnel. From the `backend/app`
folder, run `python main.py --tunnel`; it generates a public `https://something.trycloudflare.com`
address and rewrites the three PayDunya URLs at runtime. That is excellent for a demo on your
laptop. It is **not** for production: the address changes every time you restart, so live customers
would receive links that stop working.

---

## 7. HTTPS with Caddy

### 7.1 Why Caddy

Caddy is a web server that obtains and renews HTTPS certificates **automatically**, with no command
to run and no renewal to remember. It sits in front of the application: the public talks to Caddy,
Caddy talks to the application on port 8000.

### 7.2 Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
```

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
```

```bash
sudo apt update && sudo apt install -y caddy
```

Check:

```bash
caddy version
```

**What you should see:** a version number such as `v2.8.4`.

### 7.3 The Caddyfile

```bash
sudo nano /etc/caddy/Caddyfile
```

Delete everything in the file and put this in, replacing the domain and the email:

```caddyfile
# Public HTTPS entry point for the PayDunya Invoice Platform.
# Caddy obtains and renews the TLS certificate automatically.

factures.mondomaine.com {
	# Email used by Let's Encrypt to warn about certificate problems.
	tls vous@votredomaine.com

	# Compress responses. The frontend is plain HTML, CSS and JavaScript.
	encode zstd gzip

	# Security headers.
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "SAMEORIGIN"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}

	# Uploaded images and generated invoices can be larger than a JSON request,
	# but nothing legitimate here is huge. This caps abusive uploads early.
	request_body {
		max_size 10MB
	}

	# Everything goes to the application: it serves the API under /api and the
	# website (index.html, catalog.html, payer.html, facture.html) from the same
	# origin.
	reverse_proxy 127.0.0.1:8000

	# Caddy's access log goes to the system journal. Inspect it with:
	# sudo journalctl -u caddy -f
	log {
		output stdout
		format console
	}
}
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

Check the file is valid, then load it:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

**What you should see:** `Valid configuration`.

```bash
sudo systemctl reload caddy
```

Wait about thirty seconds — Caddy is requesting your certificate — then test from your own computer:

```bash
curl https://factures.mondomaine.com/health
```

**What you should see:** `{"status":"ok"}` if the application is already running, or a
`502 Bad Gateway` if it is not started yet. **A 502 is good news at this stage**: it means HTTPS
works and Caddy reached your server; only the application behind it is missing. That is section 8.

If instead you get a certificate error, check that DNS really points at this server (section 3.2)
and that ports 80 and 443 are open (`sudo ufw status`). Caddy needs port 80 reachable to prove
domain ownership.

---

## 8. Keeping it running with systemd

### 8.1 Why

If you start the application by typing a command in your terminal, it dies the moment you close the
terminal, and it does not come back after a reboot or a crash. A **systemd service** is a small
file that tells Linux to run it as a permanent background service, start it at boot, and restart it
if it stops.

### 8.2 First, start it once by hand

Before automating, prove it works:

```bash
cd /opt/paydunya/app/backend && /opt/paydunya/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**What you should see:** several lines ending with
`Uvicorn running on http://127.0.0.1:8000`, and, on the very first run only,
`Created super admin: vous@votredomaine.com`.

If instead you see a long red error mentioning `ServerSelectionTimeoutError` or `Authentication
failed`, your `MONGODB_URL` is wrong or the server's IP is not allowed in Atlas — go back to
section 4.2.

Press `Ctrl+C` to stop it, then confirm the public site now answers:

```bash
curl https://factures.mondomaine.com/health
```

Run that from your own computer while the application is running, and you should get
`{"status":"ok"}`.

### 8.3 The service file

```bash
sudo nano /etc/systemd/system/paydunya.service
```

Paste this exactly:

```ini
[Unit]
Description=PayDunya Invoice Platform (FastAPI)
Documentation=https://github.com/meatybeet/paydunya-invoice-platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
Group=deploy

# The application resolves backend/.env and the uploads folder relative to this
# directory, so it must be the backend folder, not the repository root.
WorkingDirectory=/opt/paydunya/app/backend

# Bind to localhost only. Caddy is the only thing allowed to reach the app.
ExecStart=/opt/paydunya/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1

# Restart on crash, but back off so a broken configuration does not spin.
Restart=always
RestartSec=5

# Send Python output straight to the journal, unbuffered, so logs are live.
Environment=PYTHONUNBUFFERED=1

# Basic hardening: the service may only write to its own uploads folder.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=/opt/paydunya/app/backend/uploads

[Install]
WantedBy=multi-user.target
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

Tell systemd to read the new file:

```bash
sudo systemctl daemon-reload
```

Start it, and make it start at every boot:

```bash
sudo systemctl enable --now paydunya
```

Check:

```bash
sudo systemctl status paydunya
```

**What you should see:** a green `active (running)` line, and below it the Uvicorn startup lines.
Press `q` to leave that screen.

### 8.4 Reading the logs

This is the command you will use most often when something goes wrong:

```bash
sudo journalctl -u paydunya -f
```

`-f` means "follow": new lines appear as they happen. Leave it open in one terminal window while you
test a payment in your browser, and you will literally watch the PayDunya callback arrive. Press
`Ctrl+C` to stop watching.

For the last 200 lines without following:

```bash
sudo journalctl -u paydunya -n 200 --no-pager
```

### 8.5 The three commands to remember

```bash
sudo systemctl restart paydunya
```

Restart after you change `.env` or update the code. **Changes to `.env` do nothing until you
restart.**

```bash
sudo systemctl stop paydunya
```

```bash
sudo systemctl start paydunya
```

---

## 9. Serving the frontend

### 9.1 There is no build step

The frontend is plain files: `index.html`, `catalog.html`, `payer.html`, `facture.html`, a
stylesheet, and a folder of JavaScript. There is no npm, no compiler, no `dist` folder to generate.
What is in `frontend/` is exactly what the browser receives.

**Why this matters to you:** to change a label or a colour, you edit the file on the server and
reload the page. There is nothing to rebuild. And when you update the code, you do not have to
remember a build command.

### 9.2 The frontend is already served — you do not need a second web server

`backend/app/main.py` mounts the `frontend/` folder at `/`, after the API routes. One process, one
domain:

| Address | Serves |
|---|---|
| `https://factures.mondomaine.com/` | the signed-in interface |
| `https://factures.mondomaine.com/catalog.html?slug=diallo-fils` | a public catalog |
| `https://factures.mondomaine.com/payer.html?token=...` | the customer's payment page |
| `https://factures.mondomaine.com/facture.html?token=...` | the permanent invoice link |
| `https://factures.mondomaine.com/api/...` | the API |
| `https://factures.mondomaine.com/uploads/...` | uploaded images |

### 9.3 The API address in `frontend/js/config.js`

`frontend/js/config.js` is where the frontend decides which API address to call. Open it and you
will see a function called `resolveApiUrl()`. Its rules, in order:

1. If a value `window.PAYDUNYA_API_URL` has been set, use that.
2. If the page was opened directly from disk (`file:`), use `http://localhost:8000/api`.
3. If the page is on `localhost` on a port other than 8000, use `http://localhost:8000/api`.
4. **Otherwise, use the address of the page itself, plus `/api`.**

Rule 4 is the production case. Because the application serves the website and the API from the same
domain, the frontend automatically calls `https://factures.mondomaine.com/api`. **In the standard
deployment described by this guide, you do not have to edit `config.js` at all.**

**When you do have to edit it:** only if you decide to host the static files somewhere else — on
Netlify, on Cloudflare Pages, or on a different domain from the API. In that case the page's own
address is no longer the API's address, and you must say so explicitly. Add this line to the
`<head>` of every HTML page, **before** the `<script src="js/config.js">` tag:

```html
<script>window.PAYDUNYA_API_URL = 'https://factures.mondomaine.com/api';</script>
```

Or edit `config.js` directly and replace the `API_URL` value:

```bash
nano /opt/paydunya/app/frontend/js/config.js
```

```js
API_URL: 'https://factures.mondomaine.com/api',
```

If you take that route you **must** also fix CORS (section 11.2) to name the frontend's domain,
otherwise the browser will block every API call.

### 9.4 Check it

Open `https://factures.mondomaine.com/` in a browser.

**What you should see:** the login screen, in French. Log in with the `SUPER_ADMIN_EMAIL` and
`SUPER_ADMIN_PASSWORD` from your `.env`.

If the page loads but stays blank after you log in, that is almost always the API address or CORS —
see the troubleshooting table.

---

## 10. Email setup

### 10.1 What email is used for

After a customer pays, the application makes the invoice available at its permanent web link,
generates a PDF copy, and emails that PDF to the address recorded on the invoice. The message also
carries the permanent link so the customer can find the invoice again later.

Email is **optional**. If the SMTP settings are empty, the application logs a warning and carries
on: the payment is still recorded, the invoice still exists, and the permanent link still works. A
failing mailbox must never break a payment that already succeeded.

### 10.2 The settings

| Setting | Meaning | Gmail value |
|---|---|---|
| `SMTP_HOST` | The outgoing mail server. | `smtp.gmail.com` |
| `SMTP_PORT` | Its port. 587 is the standard for STARTTLS. | `587` |
| `SMTP_USER` | The account that logs in. | your full Gmail address |
| `SMTP_PASSWORD` | Its password. **See 10.3.** | the 16-character app password |
| `SMTP_FROM` | The "From" shown to the customer. Can be `Name <address>`. | `DIALLO & FILS <vous@gmail.com>` |
| `SMTP_STARTTLS` | Whether to upgrade the connection to encrypted. | `true` |

### 10.3 Gmail requires an app password, not your normal password

Google stopped accepting normal account passwords from programs. If you put your usual Gmail
password in `SMTP_PASSWORD`, authentication will fail every single time, no matter how correct the
password is.

You need an **app password**: a 16-character code that Google generates for one specific
application.

1. Go to `https://myaccount.google.com/security`.
2. Turn on **2-Step Verification** if it is not already on. **App passwords do not exist until
   2-Step Verification is enabled** — this is the step people miss.
3. Go to `https://myaccount.google.com/apppasswords`.
4. Create one, name it `Factures`.
5. Google shows 16 letters in four groups. Copy them.
6. Put them in `SMTP_PASSWORD`. Spaces are ignored, but removing them is cleaner.

```bash
nano /opt/paydunya/app/backend/.env
```

```bash
sudo systemctl restart paydunya
```

**Warning:** an app password is as powerful as your account for sending mail. Keep it in `.env`
only. If it leaks, revoke it on the same Google page.

### 10.4 Alternatives to Gmail

Gmail is fine for a handful of invoices a day. If you send more, or if messages start landing in
spam, use a service built for it — Brevo, Mailgun, Amazon SES, or your domain host's mail service.
They all give you the same four values (`HOST`, `PORT`, `USER`, `PASSWORD`), so nothing else
changes. Sending from an address at your own domain, with SPF and DKIM records set up by that
provider, dramatically improves delivery.

### 10.5 Check it

The honest test is a real payment (section 13). But you can check that the server can reach the mail
host at all:

```bash
curl -v telnet://smtp.gmail.com:587
```

**What you should see:** `Connected to smtp.gmail.com`. Press `Ctrl+C`. If it hangs, your VPS
provider blocks outgoing port 587 — some do, to fight spam. Ask their support to open it, or use a
provider that offers port 2525.

---

## 11. Security checklist before opening to the public

Do not share a link with a real customer until every box below is ticked. Two of these are not
optional: items 11.1 and 11.2 protect your customers' personal data.

### 11.1 Verify private invoice access

The application already protects its ordinary invoice routes: a signed-in user sees only invoices
they created or invoices for businesses they may access. A super administrator may see all of them.
Only the super administrator may cancel or reopen an unpaid invoice; the **paid** state comes only
from PayDunya's verified callback.

Do not merely trust this statement: check it before you go live. From your own computer, with no
login:

```bash
curl -i https://factures.mondomaine.com/api/invoices
```

**What you should see:** `HTTP/2 401` (or 403) and a refusal. If you see a JSON list of invoices
with customer names in it, **do not go public**: stop and deploy the current version of the project.

**Important distinction:** the *public* invoice routes under `/api/public/invoices/{token}` are open
on purpose — a paying customer has no account. They are protected differently, by a long unguessable
token, and they deliberately never expose the customer's email or phone. Do not add a login to
those routes; that would break the payment links.

- [ ] Invoice routes require authentication, verified with the command above

### 11.2 Keep cross-origin browser access closed

**What CORS is:** a browser rule that decides which *other websites* may call your API. In this
guide the frontend and API are served from the same address, so you should leave this setting empty:

```env
CORS_ORIGINS=
```

If, later, you deliberately host the frontend somewhere else, add **only** its exact origin in
`backend/.env` (no trailing slash), for example:

```env
CORS_ORIGINS=https://app.mondomaine.com
```

For two separate frontend origins, separate them with a comma. Do not use `*`. An empty value still
allows only the local development server on port 5500; it does not open the API to internet sites.
Restart after any change:

```bash
sudo systemctl restart paydunya
```

**Note:** CORS is not a substitute for login checks; it only controls browsers. The private invoice
test in section 11.1 is still essential.

**What you should see after restarting:** the site works exactly as before. If the interface goes
blank, you named the wrong origin — it must match the address in the browser's bar exactly, scheme
included, with no trailing slash.

- [ ] `CORS_ORIGINS` is blank for same-origin hosting, or lists only my real frontend origin

### 11.3 Never commit `backend/.env`

The project's `.gitignore` already lists `.env`, `private_key.pem` and `.paydunya_account_keys`.
Confirm on the server that Git is not tracking your secrets:

```bash
cd /opt/paydunya/app && git status --short
```

**What you should see:** `.env` must **not** appear in the list. If it does, it is being tracked and
your keys are one `git push` away from being public.

Also confirm nothing secret is already in the repository's history:

```bash
cd /opt/paydunya/app && git ls-files | grep -iE "\.env$|\.pem$"
```

**What you should see:** only `backend/.env.example`, which contains placeholders and no real
values. If a real key ever reaches GitHub, deleting the file is not enough — you must **rotate the
key** (generate a new one in the PayDunya dashboard), because the old one stays in the history.

- [ ] `git status` does not list `.env`
- [ ] No `.pem` or real `.env` in `git ls-files`

### 11.4 The rest of the list

- [ ] **`SUPER_ADMIN_PASSWORD` is not the example value.** Log in and confirm it is a password you
      chose, 16 characters or more.
- [ ] **`AUTH_SECRET` is the random value you generated**, not `change-this-before-production` and
      not `replace-with-a-long-random-secret`.
- [ ] **`.env` permissions are `600`.** Check with `ls -l /opt/paydunya/app/backend/.env` — you
      should see `-rw-------`.
- [ ] **Port 8000 is not open to the internet.** Check with `sudo ufw status`: only 22, 80 and 443
      should be listed. Test from your own computer with
      `curl --max-time 5 http://factures.mondomaine.com:8000/health` — it should time out or be
      refused, not answer.
- [ ] **Atlas network access does not use `0.0.0.0/0`.** Only your server's IP.
- [ ] **The site is HTTPS only.** Visit `http://factures.mondomaine.com` — Caddy should redirect you
      to `https://`.
- [ ] **`private_key.pem` was not copied to the server** unless something genuinely needs it. It is
      in the repository folder on your computer and is excluded from Git; keep it that way.
- [ ] **SSH: disable password login** once you have set up an SSH key
      (`PasswordAuthentication no` in `/etc/ssh/sshd_config`, then `sudo systemctl restart ssh`).
      Do this only after confirming your key works in a second terminal, or you will lock yourself
      out.
- [ ] **Keep the machine patched.** `sudo apt update && sudo apt upgrade -y`, monthly at least.
- [ ] **Backups are configured and you have restored one at least once** (section 12).

---

## 12. Backups

### 12.1 There are two things to back up, not one

This is the mistake that hurts most, so it is stated plainly:

| What | Where it lives | Contains |
|---|---|---|
| **The database** | MongoDB Atlas (or the local container) | users, businesses, categories, products, invoices, receipt numbers, payment tokens |
| **The uploads folder** | `/opt/paydunya/app/backend/uploads/` on the server's disk | every image uploaded for a business or a product |

**Uploaded images are files on the disk. They are not inside the database.** The database only
stores their addresses, like `/uploads/abc123.jpg`. So a perfect database backup, restored on a new
server, gives you a catalog where every image is a broken tile. Back up both, always together.

### 12.2 Backing up the database

**If you are on Atlas:** do not assume that the free M0 tier has snapshots — it does not. Use a
plan with backups for production, or take and copy off-site your own dump every day. Even with a
managed backup plan, keep an independent restore-tested copy.

Install MongoDB Database Tools using the current Ubuntu instructions from MongoDB before continuing:

`https://www.mongodb.com/docs/database-tools/installation/installation-linux/`

Then confirm the command exists:

```bash
mongodump --version
```

Take a dump (replace the connection string with yours):

```bash
mongodump --uri="mongodb+srv://<atlas-username>:<atlas-password>@cluster0.abcde.mongodb.net/paydunya_invoice_platform" --archive=/home/deploy/backups/db-$(date +%F).archive --gzip
```

**What you should see:** lines counting documents from `users`, `businesses`, `categories`,
`products` and `invoices`, ending with `done dumping`.

**If you self-host MongoDB in Docker instead:**

```bash
docker exec paydunya-invoice-mongo mongodump --db=paydunya_invoice_platform --archive --gzip > /home/deploy/backups/db-$(date +%F).archive
```

### 12.3 Backing up the uploads folder

```bash
tar -czf /home/deploy/backups/uploads-$(date +%F).tar.gz -C /opt/paydunya/app/backend uploads
```

**What you should see:** no output at all — `tar` is silent on success. Confirm with:

```bash
ls -lh /home/deploy/backups/
```

You should see both files, and the `uploads` archive should not be 45 bytes (that would mean an
empty folder).

### 12.4 An automatic nightly backup

Create the folder and a small script:

```bash
mkdir -p /home/deploy/backups
```

```bash
nano /home/deploy/backup.sh
```

```bash
#!/bin/bash
# Nightly backup: MongoDB data and the uploads folder must be kept together,
# because uploaded images are files on disk and are not stored in the database.
set -euo pipefail

BACKUP_DIR=/home/deploy/backups
STAMP=$(date +%F)
MONGO_URI="mongodb+srv://<atlas-username>:<atlas-password>@cluster0.abcde.mongodb.net/paydunya_invoice_platform"

mkdir -p "$BACKUP_DIR"

mongodump --uri="$MONGO_URI" --archive="$BACKUP_DIR/db-$STAMP.archive" --gzip
tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C /opt/paydunya/app/backend uploads

# Keep 14 days of history.
find "$BACKUP_DIR" -name 'db-*.archive' -mtime +14 -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +14 -delete

echo "Backup completed: $STAMP"
```

Make it runnable and protect it (it contains the database password):

```bash
chmod 700 /home/deploy/backup.sh
```

Test it once:

```bash
/home/deploy/backup.sh
```

**What you should see:** the mongodump output, then `Backup completed: 2026-09-05`.

Schedule it for 02:30 every night:

```bash
crontab -e
```

Add this line at the end:

```text
30 2 * * * /home/deploy/backup.sh >> /home/deploy/backups/backup.log 2>&1
```

**Why:** `cron` is Linux's alarm clock. This line means "at minute 30 of hour 2, every day, run the
script and append everything it says to a log file".

### 12.5 Copy the backups off the server

A backup on the same machine as the data protects you from a mistake, not from losing the machine.
Once a week, from **your own computer**:

```bash
scp deploy@factures.mondomaine.com:/home/deploy/backups/* C:/Users/alban/backups-factures/
```

### 12.6 Practise a restore

An untested backup is a rumour. Once, on a spare machine or a test database:

```bash
mongorestore --uri="YOUR_TEST_URI" --archive=/home/deploy/backups/db-2026-09-05.archive --gzip
```

```bash
tar -xzf /home/deploy/backups/uploads-2026-09-05.tar.gz -C /opt/paydunya/app/backend
```

**What you should see:** the restored interface lists your businesses and shows their images.

---

## 13. Testing it end to end

Do this with **test keys first** (`PAYDUNYA_MODE=test`), then repeat with live keys and a genuinely
small real amount once verification is approved.

Keep the logs open in a second terminal for the whole test:

```bash
sudo journalctl -u paydunya -f
```

### Step 1 — the server answers

```bash
curl https://factures.mondomaine.com/health
```

**Expected:** `{"status":"ok"}`

### Step 2 — log in

Open `https://factures.mondomaine.com/` and sign in with your super-admin credentials.

**Expected:** the French interface loads, with the businesses and invoices navigation.

### Step 3 — a business with an image

Create a business (or open the existing one), and upload a logo.

**Expected:** the image appears on the business card immediately. Confirm it really landed on disk:

```bash
ls -l /opt/paydunya/app/backend/uploads/
```

**Expected:** at least one image file.

### Step 4 — products and a payment link

Add a product priced above 200 FCFA, then use **"Créer un lien de paiement"**, tick the product, set
a quantity, and enter a customer name and **a real email address you can open**.

**Expected:** the page shows a shareable link of the form
`https://factures.mondomaine.com/payer.html?token=...` with a copy button.

**Note the 200 FCFA rule:** PayDunya refuses any checkout below 200 FCFA. The interface blocks it
first with a French message, so if you see that message, it is the safeguard working, not a bug.

### Step 5 — the customer's view

Open that link in a **private browsing window** (to prove it works without being logged in).

**Expected:** the order, the business, the total in FCFA, and a large **"Payer maintenant"** button.

### Step 6 — pay

Click it. You land on PayDunya's checkout. Pay with a test method in test mode, or with a real
mobile-money account for a small real amount in live mode.

**Expected in the log window:** a `POST /api/payments/callback` line appearing within seconds of the
payment. **This is the single most important line in the whole test.** If it never appears, go
straight to the troubleshooting table — the invoice will stay "en attente".

### Step 7 — the return and the automatic download

**Expected:** your browser is redirected back to `facture.html`, the invoice is displayed, and the
download starts on its own. If your browser blocked the automatic download, the page says in French
that you can click to download — that button is the fallback and it must be there.

### Step 8 — the email

Check the customer mailbox you used (including the spam folder).

**Expected:** an email with the invoice attached as a PDF, and the permanent link in the body.

If nothing arrives, look for a warning line in the log window mentioning SMTP; the payment itself is
unaffected.

### Step 9 — the permanent link

Copy the permanent link printed **inside the invoice itself**, and open it in another private
window, ideally on your phone.

**Expected:** the same invoice, marked as paid, with its receipt number.

### Step 10 — open the link twice

Open the `payer.html` link again after paying.

**Expected:** a paid state, not a second payment button.

### Step 11 — the money

Log in to your PayDunya dashboard.

**Expected:** the transaction is listed with the right amount. In live mode, confirm the payout
reaches your account.

### Final checklist

- [ ] `/health` answers over HTTPS
- [ ] Login works
- [ ] Image upload works and the file is on disk
- [ ] Payment link is created and opens without login
- [ ] `POST /api/payments/callback` appears in the log
- [ ] Invoice status becomes paid, with a receipt number
- [ ] Invoice downloads automatically, and the manual button works too
- [ ] Email arrives with the attachment
- [ ] Permanent link opens from another device
- [ ] Transaction visible in the PayDunya dashboard
- [ ] Section 11 checklist fully ticked

---

## 14. Troubleshooting

Before anything else, run these two commands. Between them they explain most problems.

```bash
sudo systemctl status paydunya
```

```bash
sudo journalctl -u paydunya -n 100 --no-pager
```

### 14.1 Symptom table

| Symptom | Likely cause | What to do |
|---|---|---|
| **The callback never fires** (no `POST /api/payments/callback` in the log) | `PAYDUNYA_CALLBACK_URL` still points at `localhost`, a private IP, or an old Cloudflare tunnel address. | Set it to `https://factures.mondomaine.com/api/payments/callback` in `.env`, then `sudo systemctl restart paydunya`. Note that a link created **before** the fix keeps the old callback baked in — create a new invoice to test. |
| Same | The site is not reachable from outside. | From a machine that is not your server: `curl -i https://factures.mondomaine.com/health`. If it fails, the problem is DNS, the firewall, or Caddy — not PayDunya. |
| Same | Callback arrives but is rejected as unverified. | Look for a `403` on `/api/payments/callback` in the log. The application checks the callback's hash against `PAYDUNYA_MASTER_KEY`. A wrong or empty master key rejects every callback. Re-copy it from the dashboard, matching the mode: **test keys with `PAYDUNYA_MODE=test`, live keys with `live`. Mixing them fails silently in exactly this way.** |
| Same | Server was down when PayDunya called. | `sudo systemctl status paydunya`. Confirm the payment in the PayDunya dashboard, save the transaction reference, then ask a technical administrator to reconcile it with PayDunya. Do **not** mark it paid manually: receipt numbering and the customer email are tied to the verified callback. |
| **A payment stays "en attente"** | The callback did not arrive — see the four rows above. It is the callback, not the browser redirect, that marks an invoice paid. | Work through the callback rows first. |
| Same | The customer abandoned on the PayDunya page. | Check the PayDunya dashboard: if no transaction exists, no money moved and "en attente" is correct. |
| Same | The invoice was paid before you fixed the callback URL. | Confirm the transaction in the dashboard and retain its reference. Ask a technical administrator to reconcile it with PayDunya; do not change an invoice to paid by hand. |
| **The invoice email never arrives** | SMTP settings are empty. | The log will show a warning that email was skipped. Fill the `SMTP_*` values (section 10) and restart. The payment itself was never at risk. |
| Same | Gmail refused the normal account password. | Gmail needs an **app password**, and app passwords require 2-Step Verification to be enabled first. See 10.3. Look for `535` or `Username and Password not accepted` in the log. |
| Same | The VPS blocks outgoing port 587. | `curl -v telnet://smtp.gmail.com:587`. If it hangs, ask your provider to open it, or use port 2525 with another mail provider. |
| Same | It arrived in spam. | Check the spam folder. Then send from your own domain with SPF and DKIM set up by your mail provider. |
| Same | The invoice is a legacy record created before email became required. | Create new payment links with the required customer email, or obtain the address and reconcile the legacy record through a technical administrator. |
| **Images do not load** (broken tiles) | The uploads folder is missing or unwritable. | `ls -ld /opt/paydunya/app/backend/uploads` — it must exist and be owned by `deploy`. Fix with `sudo chown -R deploy:deploy /opt/paydunya/app/backend/uploads`. Check that the systemd unit's `ReadWritePaths` line names that exact folder. |
| Same | The file is genuinely gone (restored a database backup without the uploads backup). | This is the section 12.1 trap. Restore the matching `uploads-*.tar.gz`. If it does not exist, the images are lost and must be re-uploaded. |
| Same | Upload rejected for being too large. | `MAX_UPLOAD_BYTES` defaults to 2 MB. Either resize the image or raise the value — and remember Caddy's `max_size 10MB` is a second ceiling above it. |
| Same | Mixed content: the page is HTTPS but an image address is HTTP. | Open the browser console (F12). If it complains about mixed content, an old absolute `http://` address is stored in the database; re-upload the image. |
| **The frontend shows nothing after login** (blank page) | JavaScript error. | Press F12, open **Console**, and read the first red line. That single line usually names the problem outright. |
| Same | The API address is wrong. | On the **Network** tab, look at where the `/api/...` requests are going. If they point at `localhost:8000`, `config.js` has been edited by hand, or an old `window.PAYDUNYA_API_URL` is set. In the standard same-domain deployment, `config.js` should be left untouched (section 9.3). |
| Same | CORS is blocking the calls. | The console says the origin was blocked. Set `CORS_ORIGINS` in `backend/.env` to the exact frontend address in the browser bar — same scheme, no trailing slash — then restart. |
| Same | Stale files cached by the browser. | Hard reload with `Ctrl+Shift+R`. If it fixes it, the deployment was fine and the browser was showing you an old copy. |
| Same | The API is down while the static pages still load. | If Caddy still serves HTML but every API call returns 502, the application crashed. `sudo systemctl status paydunya`, then the log. |
| **502 Bad Gateway on every page** | The application is not running. | `sudo systemctl restart paydunya`, then read the log. Most often the database is unreachable — check `MONGODB_URL` and the Atlas IP allowlist. |
| **Certificate error / "not secure"** | Caddy could not obtain a certificate. | DNS must point at this server (`nslookup`), and port 80 must be open. `sudo journalctl -u caddy -n 50 --no-pager` names the reason. |
| **Cannot log in as super admin** | The account was never created, because `.env` was incomplete on the very first start. | The application creates it only when no super admin exists. Look for `Created super admin:` in the log. Fill the values and restart; if a super admin already exists with a forgotten password, it must be reset directly in the database. |
| **"Le montant minimum est de 200 FCFA"** | Working as designed. | PayDunya rejects any checkout under 200 FCFA. Raise the amount. |
| **A change to `.env` had no effect** | Settings are read once, at startup. | `sudo systemctl restart paydunya`. This explains an astonishing share of "it did not work". |
| **Everything broke right after an update** | New code, old libraries. | `cd /opt/paydunya/app && git pull`, then `/opt/paydunya/venv/bin/pip install -r backend/requirements.txt`, then restart. |

### 14.2 Rolling back

If an update breaks the site and you need it working again now:

```bash
cd /opt/paydunya/app && git log --oneline -n 5
```

```bash
cd /opt/paydunya/app && git checkout <the-commit-id-that-worked>
```

```bash
sudo systemctl restart paydunya
```

Your `.env`, your uploads and your database are untouched by this — only the code moves back.

### 14.3 Information to gather before asking for help

1. The exact symptom, and the exact French message shown on screen.
2. `sudo journalctl -u paydunya -n 100 --no-pager`
3. The browser console output (F12) for a frontend problem.
4. Whether `PAYDUNYA_MODE` is `test` or `live`.
5. The result of `curl -i https://factures.mondomaine.com/health`.

**Never paste the contents of `.env`, an app password, or a PayDunya private key** into a message,
a forum post or a support ticket. Describe the setting instead: "the callback URL is my HTTPS domain
plus `/api/payments/callback`".

---

## Appendix — the commands you will use most

| Task | Command |
|---|---|
| Watch the logs live | `sudo journalctl -u paydunya -f` |
| Restart after changing `.env` | `sudo systemctl restart paydunya` |
| Is it running? | `sudo systemctl status paydunya` |
| Is the site up? | `curl https://factures.mondomaine.com/health` |
| Edit settings | `nano /opt/paydunya/app/backend/.env` |
| Update the code | `cd /opt/paydunya/app && git pull && sudo systemctl restart paydunya` |
| Back up now | `/home/deploy/backup.sh` |
| Reload Caddy after editing the Caddyfile | `sudo systemctl reload caddy` |

## Appendix — switching from test to live

When PayDunya approves your verification:

1. Copy the **live** master key, private key and token from the dashboard.
2. `nano /opt/paydunya/app/backend/.env`
3. Change `PAYDUNYA_MODE=test` to `PAYDUNYA_MODE=live` and replace all three keys.
4. `sudo systemctl restart paydunya`
5. Create one invoice for a small real amount and pay it yourself, following section 13.
6. Confirm in the PayDunya dashboard that the money arrived.

Do not skip step 5. Test keys and live keys are separate worlds, and the only proof that the live
one works is a real transaction that you watch complete.
