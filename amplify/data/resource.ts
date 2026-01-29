import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Recipe: a
    .model({
      name: a.string().required(),
      ingredients: a.string().required(),
      directions: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});