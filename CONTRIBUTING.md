# 🐸 Contributing to FROGZ 🐸

We're thrilled you're interested in contributing to **FROGZ**! This project is built on the philosophy of simplicity, privacy, and open-source principles. Your contributions help us keep the web unbloated and accessible for everyone.

Before you start, please read through this guide.

## Our Philosophy

FROGZ stands against the increasing complexity and data collection prevalent on the modern web. We aim for:

*   **Simplicity:** Code should be easy to understand and maintain. Features should be lean and purposeful.
*   **Privacy:** No tracking, no unnecessary data collection, no client-side JavaScript by default on content pages.
*   **Openness:** Everything is open-source, and we value community input.

Please keep these tenets in mind when proposing changes or writing code.

## How to Contribute

There are many ways to contribute to FROGZ, not just by writing code:

### Reporting Bugs

Found something that's not working as expected? Please open an [issue on GitHub](https://github.com/taislin/frogz/issues).
When reporting a bug, please include:

1.  A clear and concise description of the bug.
2.  Steps to reproduce the behavior.
3.  Expected behavior.
4.  Screenshots or GIFs (if applicable).
5.  Your operating system and browser (if frontend related).

### Suggesting Features

Have an idea for a new feature that aligns with our anti-bloat philosophy? We'd love to hear it!
Open an [issue on GitHub](https://github.com/taislin/frogz/issues) and describe:

1.  The problem you're trying to solve.
2.  Your proposed solution or feature idea.
3.  Why this feature is important and how it aligns with FROGZ's core principles (simplicity, privacy, no bloat).

### Code Contributions (Pull Requests)

Ready to dive into the code? Here's how to get started:

1.  **Fork the Repository:** Click the "Fork" button at the top right of the [FROGZ GitHub repository](https://github.com/taislin/frogz).
2.  **Clone Your Fork:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/frogz.git
    cd frogz
    ```
3.  **Set Up Your Local Environment:**
    *   **Node.js:** Ensure you have Node.js installed (version >=16.x as specified in `package.json`).
    *   **Install Dependencies:**
        ```bash
        npm install
        ```
    *   **PostgreSQL Database:** You'll need a running PostgreSQL instance.
        *   **Local Setup:** Install PostgreSQL locally, or use Docker:
            ```bash
            # Example Docker command for a local PostgreSQL container
            docker run --name some-postgres -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgres
            ```
        *   **Database Creation:** Connect to your PostgreSQL instance (e.g., using `psql`) and create a database for FROGZ:
            ```sql
            CREATE DATABASE frogz_dev;
            ```
    *   **Environment Variables:** Create a `.env` file in the root of your project with your database credentials. You can use `.env.sample` as a template:
        ```ini
        # .env.sample
        PG_USER=your_pg_user # e.g., postgres
        PG_PASSWORD=your_pg_password # e.g., mysecretpassword
        PG_HOST=localhost # or your Docker container IP/name
        PG_PORT=5432
        PG_DATABASE=frogz_dev
        PORT=3000 # Optional, default is 3000
        NODE_ENV=development
        ```
        Remember to replace the placeholder values with your actual database credentials.

4.  **Run the Application:**
    ```bash
    npm start
    ```
    Your application should now be running at `http://localhost:3000`.

5.  **Create a Branch:**
    ```bash
    git checkout -b feature/your-feature-name-or-bugfix/your-bug-name
    ```

6.  **Make Your Changes:**
    *   Write clean, well-commented code.
    *   Adhere to the existing code style (we use ESLint/Prettier for consistent formatting, ensure your IDE is set up for it).
    *   **Write Tests:** (If applicable) If you're adding a new feature or fixing a bug, please add corresponding tests.
    *   **Run Tests:**
        ```bash
        # Placeholder for test command, if tests are implemented
        # npm test
        ```
    *   **Lint Your Code:**
        ```bash
        # Placeholder for lint command, if ESLint/Prettier is set up
        # npm run lint
        ```

7.  **Commit Your Changes:**
    Write clear, concise commit messages. We encourage [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (e.g., `feat: add new style option`, `fix: prevent XSS vulnerability`).
    ```bash
    git add .
    git commit -m "feat: Briefly describe your change"
    ```

8.  **Push to Your Fork:**
    ```bash
    git push origin feature/your-feature-name
    ```

9.  **Create a Pull Request:**
    *   Go to your fork on GitHub and click "Compare & pull request" next to your branch.
    *   Provide a detailed description of your changes, why they were made, and any relevant issue numbers.
    *   Be ready to discuss your changes and address feedback.

## Code of Conduct

We expect all contributors to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md - *Create this file or link to a standard one like Contributor Covenant*). Be respectful, inclusive, and helpful.

## License

By contributing to FROGZ, you agree that your contributions will be licensed under the **AGPL-3.0** license, as per the project's main license.

## Contact

If you have any questions, feel free to reach out to us at `contact [at] frogz [dot] club`.

Thank you for helping us build a simpler, better web with FROGZ!