import * as crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";

interface WebhookDeliveryMessage {
  tenantId: string;
  webhookId: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export class WebhookDeliveryHandler {
  private readonly maxRetries = 3;

  constructor(private readonly prisma: PrismaClient) {}

  async handle(data: Record<string, unknown>): Promise<void> {
    const msg = data as unknown as WebhookDeliveryMessage;
    console.log(
      `[WebhookDeliveryHandler] Delivering webhook ${msg.webhookId} event ${msg.event}`,
    );

    const webhook = await this.prisma.webhook.findFirst({
      where: { id: msg.webhookId, tenantId: msg.tenantId, isEnabled: true },
    });

    if (!webhook) {
      console.warn(`[WebhookDeliveryHandler] Webhook ${msg.webhookId} not found or disabled`);
      return;
    }

    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId: msg.webhookId,
        event: msg.event,
        requestBody: msg.data as object,
      },
    });

    await this.deliver(webhook.url, webhook.secret, msg.event, msg.data, delivery.id);
  }

  private async deliver(
    url: string,
    secret: string,
    event: string,
    data: Record<string, unknown>,
    deliveryId: string,
  ): Promise<void> {
    const body = JSON.stringify(data);
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": event,
            "X-Webhook-Signature": `sha256=${signature}`,
            "X-Webhook-Delivery": deliveryId,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });

        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            responseStatus: response.status,
            responseBody: await response.text(),
            attemptCount: attempt,
            lastAttemptAt: new Date(),
            deliveredAt: response.ok ? new Date() : null,
          },
        });

        if (response.ok) {
          console.log(`[WebhookDeliveryHandler] Delivered ${deliveryId} on attempt ${attempt}`);
          return;
        }

        console.warn(
          `[WebhookDeliveryHandler] Attempt ${attempt} failed with status ${response.status}`,
        );
      } catch (err) {
        console.error(
          `[WebhookDeliveryHandler] Attempt ${attempt} error:`,
          err instanceof Error ? err.message : err,
        );

        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            attemptCount: attempt,
            lastAttemptAt: new Date(),
          },
        });
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < this.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }

    console.error(`[WebhookDeliveryHandler] All ${this.maxRetries} attempts exhausted for ${deliveryId}`);
  }
}
