type MessageHandler = (data: Record<string, unknown>) => Promise<void>;

interface PubSubMessage {
  data: Buffer;
  ack(): void;
  nack(): void;
}

interface Subscription {
  on(event: string, handler: (...args: never[]) => void): void;
  close(): Promise<void>;
}

interface PubSubClient {
  subscription(name: string): Subscription;
  close(): Promise<void>;
}

export class PubSubSubscriber {
  private client: PubSubClient | null = null;
  private subscriptions: Subscription[] = [];

  constructor(private readonly projectId: string) {}

  subscribe(subscriptionName: string, handler: MessageHandler): void {
    void this.initAndSubscribe(subscriptionName, handler);
  }

  private async initAndSubscribe(
    subscriptionName: string,
    handler: MessageHandler,
  ): Promise<void> {
    if (!this.client) {
      try {
        const mod = await import("@google-cloud/pubsub" as string);
        const PubSub = mod.PubSub ?? mod.default?.PubSub;
        this.client = new PubSub({ projectId: this.projectId }) as PubSubClient;
      } catch {
        console.warn(
          `[PubSubSubscriber] @google-cloud/pubsub not available — skipping ${subscriptionName}`,
        );
        return;
      }
    }

    const subscription = this.client.subscription(subscriptionName);
    this.subscriptions.push(subscription);

    subscription.on("message", ((message: PubSubMessage) => {
      const data = JSON.parse(message.data.toString()) as Record<string, unknown>;
      handler(data)
        .then(() => message.ack())
        .catch((err: unknown) => {
          console.error(`[PubSubSubscriber] Handler error on ${subscriptionName}:`, err);
          message.nack();
        });
    }) as never);

    subscription.on("error", ((err: Error) => {
      console.error(`[PubSubSubscriber] Subscription error on ${subscriptionName}:`, err.message);
    }) as never);

    console.log(`[PubSubSubscriber] Listening on ${subscriptionName}`);
  }

  async close(): Promise<void> {
    for (const sub of this.subscriptions) {
      await sub.close();
    }
    if (this.client) {
      await this.client.close();
    }
  }
}
