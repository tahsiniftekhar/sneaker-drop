import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

interface User {
  id: number;
  username: string;
}

export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get<{ data: User[] }>('/users');
        setUsers(response.data.data);
      } catch (error: any) {
        toast.error(`Failed to fetch users: ${error.response?.data?.message || error.message}`);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  return { users, loadingUsers };
};
