export interface RequestComment {
  id: string;
  requestId: string;
  authorId: string;
  text: string;
  createdAt?: Date;
  editedAt?: Date;
}


