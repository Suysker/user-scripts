// ==UserScript==
// @name     B站用户屏蔽
// @namespace https://github.com/NateScarlet/Scripts/tree/master/user-script
// @description 避免看到指定用户上传的视频，在用户个人主页会多出屏蔽按钮。
// @grant    GM.getValue
// @grant    GM.setValue
// @grant    GM.deleteValue
// @include	 https://search.bilibili.com/*
// @include	 https://space.bilibili.com/*
// @include	 https://www.bilibili.com/*
// @run-at   document-start
// ==/UserScript==

// spell-checker: word bili bilibili upname datetime

import compare from "@/utils/compare";
import obtainHTMLElement from "@/utils/obtainHTMLElement";
import useGMValue from "@/utils/useGMValue";
import usePolling from "@/utils/usePolling";
import { render, html } from "lit-html";
import { mdiAccountCancelOutline } from "@mdi/js";
import setHTMLElementDisplayHidden from "@/utils/setHTMLElementDisplayHidden";

export {};

interface BlockedUser {
  name: string;
  blockedAt: number;
}

const blockedUsers = useGMValue(
  "blockedUsers@206ceed9-b514-4902-ad70-aa621fed5cd4",
  {} as Record<string, BlockedUser | true | undefined>
);

async function migrateV1() {
  const key = "blockedUserIDs@7ced1613-89d7-4754-8989-2ad0d7cfa9db";
  const oldValue = await GM.getValue(key);
  if (!oldValue) {
    return;
  }
  const newValue = { ...blockedUsers.value };
  (JSON.parse(String(oldValue)) as string[]).forEach((i) => {
    newValue[i] = true;
  });
  blockedUsers.value = newValue;
  await GM.deleteValue(key);
}

function renderActions(userID: string) {
  const parent = document.querySelector(".h-action");
  if (!parent) {
    return;
  }

  const container = obtainHTMLElement(
    "div",
    "7ced1613-89d7-4754-8989-2ad0d7cfa9db",
    {
      onCreate: (el) => {
        el.style.display = "inline";
        parent.append(el, parent.lastChild!);
      },
    }
  );
  const isBlocked = !!blockedUsers.value[userID];

  render(
    html`
      <span
        class="h-f-btn"
        @click=${(e: MouseEvent) => {
          e.stopPropagation();
          const isBlocked = !!blockedUsers.value[userID];
          blockedUsers.value = {
            ...blockedUsers.value,
            [userID]: !isBlocked
              ? {
                  name: document.getElementById("h-name")?.innerText ?? "",
                  blockedAt: Date.now(),
                }
              : undefined,
          };
        }}
      >
        ${isBlocked ? "取消屏蔽" : "屏蔽"}
      </span>
    `,
    container
  );
}

function renderNav() {
  const parent = document.querySelector(".right-entry");
  if (!parent) {
    return;
  }
  const container = obtainHTMLElement(
    "li",
    "db7a644d-1c6c-4078-a9dc-991b15b68014",
    {
      onCreate: (el) => {
        el.classList.add("right-entry-item");
        parent.prepend(parent.firstChild!, el);
      },
    }
  );
  const count = Object.keys(blockedUsers.value).length;
  setHTMLElementDisplayHidden(container, count == 0);

  render(
    html`
<button
  type="button"
  class="right-entry__outside" 
  @click=${(e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(blockedUsersURL(), "_blank");
  }}
>
  <svg width="20" height="21" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg" class="right-entry-icon">
    <path fill-rule="evenodd" clip-rule="evenodd" d=${mdiAccountCancelOutline} fill="currentColor">
  </svg>
  <span class="right-entry-text">
    <span>屏蔽</span>
    <span>(${count})</span>
  </span>
</button>
`,
    container
  );
}

function parseUserURL(rawURL: string | undefined): string | undefined {
  if (!rawURL) {
    return;
  }
  const url = new URL(rawURL, window.location.href);
  switch (url.host) {
    case "space.bilibili.com": {
      const match = /^\/(\d+)\/?/.exec(url.pathname);
      if (!match) {
        return;
      }
      return match[1];
    }
    case "cm.bilibili.com": {
      return url.searchParams.get("space_mid") || undefined;
    }
  }
}

function parseVideoURL(rawURL: string | undefined) {
  if (!rawURL) {
    return;
  }
  const url = new URL(rawURL, window.location.href);
  if (url.host !== "www.bilibili.com") {
    return;
  }
  const match = /^\/video\//.exec(url.pathname);
  if (!match) {
    return;
  }
  return {};
}

function renderVideoList() {
  document.querySelectorAll<HTMLElement>(".bili-video-card").forEach((i) => {
    const rawURL = i
      .querySelector("a.bili-video-card__info--owner")
      ?.getAttribute("href");
    if (!rawURL) {
      return;
    }
    const userID = parseUserURL(rawURL);
    if (!userID) {
      return;
    }
    const isBlocked = !!blockedUsers.value[userID];
    let container = i;
    while (container.parentElement?.childElementCount === 1) {
      container = i.parentElement!;
    }

    setHTMLElementDisplayHidden(container, isBlocked);
  });
}

function renderVideoDetail() {
  const blockedTitles = new Set<string>();

  document
    .querySelectorAll<HTMLElement>(".video-page-card-small")
    .forEach((i) => {
      const rawURL = i.querySelector(".upname a")?.getAttribute("href");
      if (!rawURL) {
        return;
      }
      const userID = parseUserURL(rawURL);
      if (!userID) {
        return;
      }
      const isBlocked = !!blockedUsers.value[userID];
      if (isBlocked) {
        const title = i.querySelector(".title[title]")?.getAttribute("title");
        if (title) {
          blockedTitles.add(title);
        }
      }
      setHTMLElementDisplayHidden(i, isBlocked);
    });

  document
    .querySelectorAll<HTMLElement>(".bpx-player-ending-related-item")
    .forEach((i) => {
      const title = i.querySelector(
        ".bpx-player-ending-related-item-title"
      )?.textContent;
      if (!title) {
        return;
      }
      const isBlocked = blockedTitles.has(title);
      setHTMLElementDisplayHidden(i, isBlocked);
    });
}

function blockedUsersHTML() {
  const userIDs = Object.keys(blockedUsers.value);
  const now = new Date();
  function getData(id: string) {
    const value = blockedUsers.value[id];
    const { blockedAt: rawBlockedAt = 0, name = id } =
      typeof value === "boolean" ? {} : value ?? {};
    const blockedAt = new Date(rawBlockedAt);
    return {
      id,
      blockedAt,
      name,
      idAsNumber: Number.parseInt(id),
      isFallback: rawBlockedAt === 0,
    };
  }
  return [
    "<html>",
    "<head>",
    "<title>已屏蔽的用户</title>",
    `<script id="data" lang="application/json">
    ${JSON.stringify(blockedUsers.value, undefined, 2)}
    </script>`,
    "</head>",
    "<body>",
    "<div>",
    `  <h1>已屏蔽 ${userIDs.length} 用户</h1>`,
    `  <time datetime="${now.toISOString()}">${now.toLocaleString()}</time>`,
    "  <ul>",
    ...userIDs
      .map(getData)
      .sort((a, b) => {
        const dateCompare = compare(a.blockedAt, b.blockedAt);
        if (dateCompare !== 0) {
          return -dateCompare;
        }
        return compare(a.idAsNumber, b.idAsNumber);
      })
      .map(({ id, name, blockedAt, isFallback }) => {
        return [
          "<li>",
          `<a href="https://space.bilibili.com/${id}" target="_blank">${name}</a>`,
          ...(!isFallback
            ? [
                `<span>屏蔽于<time datetime="${blockedAt.toISOString()}">${blockedAt.toLocaleString()}</time></span>`,
              ]
            : []),
          "</li>",
        ].join("\n");
      }),
    "  </ul>",
    "</div>",
    "</body>",
    "</html>",
  ].join("\n");
}

function blockedUsersURL() {
  const b = new Blob([blockedUsersHTML()], {
    type: "text/html;charset=UTF-8",
  });
  return URL.createObjectURL(b);
}

async function main() {
  await migrateV1();
  const rawURL = window.location.href;
  {
    const userID = parseUserURL(rawURL);
    if (userID) {
      usePolling({
        update: () => {
          renderNav();
          renderActions(userID);
        },
        scheduleNext: (update) => setTimeout(update, 100),
      });
      return;
    }
  }

  if (parseVideoURL(rawURL)) {
    usePolling({
      update: () => {
        renderNav();
        renderVideoDetail();
      },
      scheduleNext: (update) => setTimeout(update, 100),
    });
    return;
  }

  usePolling({
    update: () => {
      renderNav();
      renderVideoList();
    },
    scheduleNext: (update) => setTimeout(update, 100),
  });
}

main();
