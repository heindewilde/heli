declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        email: string;
        username: string | null;
        region: string;
      } | null;
    }
  }
}

export {};
