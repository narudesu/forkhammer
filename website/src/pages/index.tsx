import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Heading from "@theme/Heading";
import Layout from "@theme/Layout";
import clsx from "clsx";
import type { ReactNode } from "react";

import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="forkhammer"
      description="Event-sourced Jira validation for OpenCode"
    >
      <HomepageHeader />
      <main>
        <section className="container margin-vert--lg">
          <div className="row">
            <div className="col col--4">
              <Heading as="h3">Intro</Heading>
              <p>
                Get a quick overview of the current system and where to start.
              </p>
              <Link to="/docs/intro">Open introduction</Link>
            </div>
            <div className="col col--4">
              <Heading as="h3">Architecture</Heading>
              <p>Learn how Forkhammer uses an event-sourced architecture.</p>
              <Link to="/docs/architecture">Read architecture</Link>
            </div>
            <div className="col col--4">
              <Heading as="h3">Setup</Heading>
              <p>See the config file and the Docker runtime assumptions.</p>
              <Link to="/docs/configuration">View configuration</Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
