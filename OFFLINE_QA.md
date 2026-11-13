# Offline edition QA matrix

## Happy path

- [ ] Fresh browser profile opens Setup
- [ ] Admin + agent PINs created
- [ ] Activation with valid code (online) unlocks device
- [ ] Agent signs in and completes a sale offline (network disabled)
- [ ] Admin unlock with PIN → add product → stock adjust → agent sells new product
- [ ] Backup export/restore from Backups page

## License reminders & lock

- [ ] With validUntil within 30/14/7/3/1 days, banner shows on POS
- [ ] After expiry, POS redirects to paywall; sales blocked
- [ ] Offline paywall disables MoMo and shows support number
- [ ] Online MoMo initiate shows approve-on-phone copy
- [ ] After Paystack success / Mark paid, pull or poll unlocks app
- [ ] Support unlock token (from Mark paid clipboard) unlocks offline

## Anti-abuse

- [ ] Clear site data → must re-activate (no free period)
- [ ] Clock set back >5 minutes → tamper lock until online/support
- [ ] Second device activation revokes previous device binding
- [ ] Forged entitlement token rejected (invalid signature)
- [ ] Dual license_state / license_state_mirror both written

## Super admin

- [ ] Create customer with custom amount/days
- [ ] Issue activation code
- [ ] Extend / mark paid produces unlock token
- [ ] Revoke device blocks pull until new activation
