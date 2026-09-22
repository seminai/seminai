# Guida Integrazione Mobile - Seminai API — Part 8

[Back to the guide index](../MOBILE_INTEGRATION_GUIDE.md)


interface UpdateUserProfileRequest {
  name?: string;
  surname?: string | null;
  fiscalCode?: string | null;
  companyName?: string | null;
  vatNumber?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  profilePictureUrl?: string | null;
  qdcApiKey?: string | null;
  ifarmingApiKey?: string | null;
}

interface UserProfileResponse {
  status: 'success';
  data: {
    user: UserFull;
    qdcApiKey: string | null;
    ifarmingApiKey: string | null;
  };
}

// ========== COMMON ==========

interface ApiSuccessResponse<T> {
  status: 'success';
  data: T;
}

interface ApiErrorResponse {
  status: 'error';
  message: string;
  code?: string;
}
```
