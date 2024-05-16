

# Message Receipts

```typescript
const receipt: WhatsappMessageSentEvent = {
      type: 'WhatsappMessageSentEvent',
      typeVersion: '1',
      originType: 'whatsapp-nats-gateway',
      originId: GATEWAY_ID!,
      payload: {
        messageId: messageData.messageId,
        status: 'sent',
      },
    };
      
      receipt.payload.status = 'failed';
      receipt.payload.failedReason = (err as any).message;

      await publish(messageSendReceiptSubject, receipt);
```
