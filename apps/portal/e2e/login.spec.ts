import { expect, test } from "@playwright/test"
import { ULB } from "../lib/ulb-branding"

test.describe("portal smoke", () => {
  test("login page renders staff sign-in", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByText(ULB.nameEn).first()).toBeVisible()
    await expect(page.getByText(/Staff portal/i)).toBeVisible()
    await expect(page.getByLabel(/Email/i)).toBeVisible()
    await expect(page.getByLabel(/Password/i)).toBeVisible()
    await expect(
      page.getByRole("link", { name: /Forgot password/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /Continue with Google/i })
    ).toHaveCount(0)
  })

  test("signup redirects to login", async ({ page }) => {
    await page.goto("/signup")
    await expect(page).toHaveURL(/\/login/)
  })

  test("forgot password page shows admin contact message", async ({ page }) => {
    await page.goto("/forgot-password")
    await expect(page.getByText(/Password recovery/i)).toBeVisible()
    await expect(page.getByText(/initiated by an administrator/i)).toBeVisible()
  })
})
