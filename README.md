# 🐸 FROGZ & The FrogPost 📬

[![Website Status](https://img.shields.io/website?down_color=red&down_message=offline&up_color=green&up_message=online&url=https%3A%2F%2Ffrogz.club)](https://frogz.club)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=taislin_frogz&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=taislin_frogz)
![GitHub repo size](https://img.shields.io/github/repo-size/taislin/frogz)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/taislin/frogz)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=taislin_frogz&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=taislin_frogz)
[![License](https://img.shields.io/github/license/taislin/frogz)](LICENSE)

---

In an internet dominated by bloat, complexity, and pervasive tracking, **FROGZ** and **The FrogPost** offer a radical alternative. We champion **simplicity, privacy, and user control**, staunchly opposing the "soydev" trend of ultra-complex, data-hungry web services.

Our mission is to empower everyone to establish their internet presence and communicate privately with minimal friction.

---

## 🐸 FROGZ: The Anti-Bloat Microhosting Service

**FROGZ** is built for pure, unadulterated web presence. It allows you to publish simple web pages using plain text, Markdown, or HTML, without any registration, ads, or client-side JavaScript. It's the simplest way to get your thoughts, ideas, or quick content online.

### Key FROGZ Features:

-   **Zero-Friction Publishing:** Create pages using only a password. No registration, no email.
-   **Hierarchical Pages:** Build multi-page sites effortlessly. Control `frogz.club/yourpage` and create unlimited subpages like `frogz.club/yourpage/about`.
-   **Learn & Grow:** A perfect playground for web development beginners. Start with plaintext, then add Markdown, HTML, and custom CSS.
-   **Absolutely FREE & Ad-Free:** No hidden costs, no disruptive advertisements, ever.
-   **(Almost) No Censorship:** We stand for free expression. Pages are removed only in [very specific, legally mandated cases](terms).
-   **Open-Source & Community-Driven:** Code is [Open-Source](https://github.com/taislin/frogz) under **AGPL-3.0**. We welcome contributions.
-   **Content Flexibility:** Craft pages with [Markdown](https://www.markdownguide.org/cheat-sheet/) or full HTML.
-   **Anti-Bloat Guaranteed:** No client-side JavaScript (on content pages), no cookies, no trackers, and no information recorded besides page contents (not even your IP address).

---

## 📬 The FrogPost: Private, Ephemeral, E2E Encrypted Inbox

**The FrogPost** is a revolutionary way to receive anonymous, one-way messages without compromising privacy or relying on email. It's an end-to-end encrypted message drop where messages self-destruct after a set period.

### Key FrogPost Features:

-   **End-to-End Encrypted (E2EE):** Messages are encrypted in the sender's browser and can only be decrypted by the inbox owner's password-derived private key. Your server never sees plaintext messages or private keys.
-   **Absolute Sender Anonymity:** No IP logging, no cookies, no personal information collected from senders.
-   **Recipient Pulls, Not Pushed:** Inbox owners must actively visit their secure URL to check for messages; no notifications are sent by the service.
-   **Self-Expiring Messages:** All messages automatically delete from the server after one week, ensuring data hygiene and limited persistence.
-   **Zero-Friction Submission:** Anonymous users can send messages to a public URL with just a text input.
-   **Password-Derived Keys:** Owners only need to remember their password; the encryption keys are securely derived in the browser.

---

## Technology Stack (Shared)

Both services run on a robust and efficient backend, carefully chosen to align with our anti-bloat philosophy:

-   **Backend:** [Node.js](https://nodejs.org/) with [Express](https://expressjs.com/)
-   **Template Engine:** [Eta](https://eta.js.org/) (a lightweight, fast alternative)
-   **Database:** [PostgreSQL](https://www.postgresql.org/)
-   **Encryption:** Web Crypto API (Client-side) & `bcryptjs` (Server-side password hashing)

---

## Get Started

-   **Start with FROGZ:** **[Visit frogz.club](https://frogz.club)** to create your first anti-bloat web page!
-   **Create an FrogPost:** **[Start your anonymous inbox here!](https://frogz.club/inbox/create)**

## Contribute

We believe in open collaboration. If you resonate with our mission against web bloat and want to help build a simpler, more private internet, we invite you to contribute!

-   **Check out our [Contributing Guide](CONTRIBUTING.md)** for setup instructions and guidelines.
-   **Explore the [source code on GitHub](https://github.com/taislin/frogz)**.

## Contact

You can reach us at `contact [at] frogz [dot] club`.

---

**Summary of `README.md` Changes:**

-   Updated title and initial description to reflect both services.
-   Created dedicated sections for FROGZ and The FrogPost, detailing their unique features.
-   Updated the "Technology Stack" to mention the encryption tools.
-   Added clear "Get Started" calls to action for both services.

---

### 3. `index.eta` (Regenerated with Inbox Link)

This updates the main FROGZ homepage to include a prominent link to the new FrogPost service.

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta
			name="description"
			content="FROGZ: The open-source, anti-bloat microhosting service for simple, private, and ad-free webpages. Create your internet presence with plain text, Markdown, or HTML. Also introducing The FrogPost for private, E2E encrypted messages." />
		<title>FROGZ - The Anti-Bloat Microhosting Service</title>

		<link rel="stylesheet" type="text/css" href="/css/basic.css" />
		<link rel="stylesheet" type="text/css" href="/css/frontpage.css" />

		<link rel="icon" type="image/png" href="/favicon.png" />
	</head>
	<body>
		<main class="frontpage-main">
			<h1 class="shimmer title">FROGZ</h1>
			<div class="flipper-container">
				<img
					src="/apu_band.gif"
					alt="A group of frogs playing musical instruments"
					class="main-hero-image" />
			</div>

			<section class="intro-section">
				<p>
					Welcome to <strong>FROGZ</strong>! We are an **open-source,
					anti-bloat microhosting service** that empowers everyone to
					create their own internet presence without the modern web's
					unnecessary complexity.
				</p>
				<p>
					You can easily create your own pages using
					<strong>plain text</strong>, **Markdown**, or **HTML**.
					Absolutely **no registration required** and **no bloat**.
				</p>
			</section>

			<div class="action-buttons-container boxed-container">
				<div class="boxed action-box" id="new-page-box">
					<img
						src="/computer.png"
						alt="Computer icon"
						class="action-icon" />
					<a href="/new" class="action-link">Create a Page</a>
				</div>
				<div class="boxed action-box" id="random-page-box">
					<img
						src="/sherlock.png"
						alt="Frog detective icon"
						class="action-icon" />
					<a href="/random" class="action-link">Random Page</a>
				</div>
				<!-- ADDED: Link to the FrogPost -->
				<div class="boxed action-box" id="inbox-link-box">
					<img
						src="/mailbox.png"
						alt="Mailbox icon"
						class="action-icon" />
					<!-- You'll need a mailbox.png image -->
					<a href="/inbox/create" class="action-link">Create Inbox</a>
				</div>
				<!-- END ADDED -->
			</div>
			<br />

			<hr class="main-separator" />

			<div class="info-features-container boxed-container">
				<section class="boxed info-box" id="info-menu">
					<h2 class="section-heading">Info</h2>
					<ul class="info-list">
						<li>
							<strong><a href="/news">News</a></strong>
						</li>
						<li>
							<strong><a href="/about">About</a></strong>
						</li>
						<li>
							<strong
								><a href="/terms"
									>Terms &amp; Conditions</a
								></strong
							>
						</li>
					</ul>
				</section>
				<section class="boxed features-box" id="features-list">
					<h2 class="section-heading">Features</h2>
					<ul class="features-list">
						<li>
							Absolutely <strong>FREE</strong> and
							<strong>NO ADS</strong>.
						</li>
						<li>No coding knowledge required.</li>
						<li>Totally anonymous - no accounts needed.</li>
						<li>Pages are editable with a defined password.</li>
						<li>
							We ❤️ Free Speech - check our
							<a href="/terms">Terms &amp; Conditions</a>.
						</li>
					</ul>
				</section>
			</div>
		</main>
	</body>
</html>
```
